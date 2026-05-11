use crate::client::PolycentricClient;
use crate::media::process_image;
use polycentric_common::models::protos_v2::{
    content_service_client::ContentServiceClient,
    event_sync_service_client::EventSyncServiceClient, feeds_service_client::FeedsServiceClient,
    notification_service_client::NotificationServiceClient,
    pairing_service_client::PairingServiceClient, server_service_client::ServerServiceClient,
    ContentDigest, CreatePairingSessionRequest, Event, FeedPageParams, GetExploreFeedRequest,
    GetFollowingFeedRequest, GetIdentityFeedRequest, GetPairingSessionRequest,
    GetPostThreadRequest, GetServerInfoRequest, JoinPairingSessionRequest, ListEventsFilters,
    ListEventsRequest, ListEventsResponse, PublicKey, PutEventsRequest, SignedEvent, SignedMessage,
    UploadBlobRequest,
};
use polycentric_common::models::traits::Serializable;
use prost::Message;
use std::sync::{Arc, Mutex};

#[cfg(all(not(target_arch = "wasm32"), not(feature = "native-transport")))]
compile_error!("rs-core on a non-wasm target requires the `native-transport` feature.");

#[cfg(target_arch = "wasm32")]
type GrpcChannel = tonic_web_wasm_client::Client;
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
type GrpcChannel = tonic::transport::Channel;

#[cfg(target_arch = "wasm32")]
fn channel(server_url: &str) -> Result<GrpcChannel, CoreError> {
    Ok(tonic_web_wasm_client::Client::new(server_url.to_string()))
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn channel(server_url: &str) -> Result<GrpcChannel, CoreError> {
    let mut endpoint = tonic::transport::Channel::from_shared(server_url.to_string())
        .map_err(|e| CoreError::Network(format!("Invalid server url: {e}")))?;
    if server_url.starts_with("https://") {
        let tls = tonic::transport::ClientTlsConfig::new().with_webpki_roots();
        endpoint = endpoint
            .tls_config(tls)
            .map_err(|e| CoreError::Network(format!("TLS config: {e}")))?;
    }
    Ok(endpoint.connect_lazy())
}

#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum CoreError {
    #[error("Decode: {0}")]
    Decode(String),

    #[error("Encode: {0}")]
    Encode(String),

    #[error("Crypto: {0}")]
    Crypto(String),

    #[error("Store: {0}")]
    Store(String),

    #[error("Image: {0}")]
    Image(String),

    #[error("Network: {0}")]
    Network(String),

    #[error("Callback: {0}")]
    Callback(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

impl From<uniffi::UnexpectedUniFFICallbackError> for CoreError {
    fn from(e: uniffi::UnexpectedUniFFICallbackError) -> Self {
        CoreError::Callback(e.reason)
    }
}

#[derive(uniffi::Record)]
pub struct ContentEntry {
    pub digest_bytes: Vec<u8>,
    pub content_bytes: Vec<u8>,
}

#[uniffi::export(with_foreign)]
#[async_trait::async_trait]
pub trait SignEventCallback: Send + Sync {
    async fn sign(&self, event_bytes: Vec<u8>) -> Result<Vec<u8>, CoreError>;
}

#[derive(uniffi::Object)]
pub struct PolycentricCore {
    client: Mutex<PolycentricClient>,
}

#[cfg_attr(not(target_arch = "wasm32"), uniffi::export(async_runtime = "tokio"))]
#[cfg_attr(target_arch = "wasm32", uniffi::export)]
impl PolycentricCore {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        #[cfg(target_arch = "wasm32")]
        console_error_panic_hook::set_once();
        Arc::new(Self {
            client: Mutex::new(PolycentricClient::new()),
        })
    }

    pub fn next_sequence(&self, identity: String, collection: i32) -> u64 {
        self.client
            .lock()
            .unwrap()
            .next_sequence(&identity, collection)
    }

    /// Verify each `SignedEvent` (decoding implicitly verifies the
    /// signature) and copy it into the local event store.
    pub fn copy_events(&self, signed_events: Vec<Vec<u8>>) -> Result<(), CoreError> {
        let mut client = self.client.lock().unwrap();
        for bytes in signed_events {
            let signed_event = SignedEvent::from_bytes(&bytes)
                .map_err(|e| CoreError::Decode(format!("Invalid signed event: {e:?}")))?;
            client
                .copy_event(signed_event)
                .map_err(|e| CoreError::Store(format!("Failed to copy event: {e:?}")))?;
        }
        Ok(())
    }

    /// Insert each (digest, content) pair into the content store.
    pub fn copy_contents(&self, contents: Vec<ContentEntry>) -> Result<(), CoreError> {
        let mut client = self.client.lock().unwrap();
        for entry in contents {
            let digest = ContentDigest::decode(entry.digest_bytes.as_slice())
                .map_err(|e| CoreError::Decode(format!("Failed to decode ContentDigest: {e}")))?;
            client.copy_content(&digest, entry.content_bytes);
        }
        Ok(())
    }

    /// Build a vector clock (returns serialized `VectorClock` proto bytes).
    pub fn build_vector_clock(
        &self,
        identity: String,
        collection: i32,
        identity_sequence: u64,
        signed_by: Vec<u8>,
        current_sequence: u64,
    ) -> Result<Vec<u8>, CoreError> {
        let pk = PublicKey::decode(signed_by.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode signed_by: {e}")))?;
        let clock = self
            .client
            .lock()
            .unwrap()
            .build_vector_clock(
                &identity,
                collection,
                identity_sequence,
                &pk,
                current_sequence,
            )
            .map_err(|e| CoreError::Store(format!("build_vector_clock: {e}")))?;
        Ok(clock.encode_to_vec())
    }

    /// Decode + verify a `SignedEvent`, returning its canonical bytes.
    pub fn verify_signed_event(&self, signed_event: Vec<u8>) -> Result<Vec<u8>, CoreError> {
        let signed_event = SignedEvent::from_bytes(&signed_event)
            .map_err(|e| CoreError::Crypto(format!("Failed to verify signed event: {e}")))?;
        signed_event
            .to_bytes()
            .map_err(|e| CoreError::Encode(format!("Failed to encode signed event: {e}")))
    }

    /// Sign event bytes via a foreign callback. Validates the inner
    /// `Event`, calls the callback to produce signature bytes, assembles
    /// a `SignedEvent`, and re-verifies before returning the canonical
    /// `SignedEvent` bytes.
    pub async fn sign_event(
        &self,
        event_bytes: Vec<u8>,
        callback: Arc<dyn SignEventCallback>,
    ) -> Result<Vec<u8>, CoreError> {
        Event::decode(event_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Invalid event bytes: {e}")))?;

        let signature = callback.sign(event_bytes.clone()).await?;

        let signed_event = SignedEvent {
            signature,
            event_bytes,
        };

        let signed_event_bytes = signed_event
            .to_bytes()
            .map_err(|e| CoreError::Encode(format!("Failed to encode signed event: {e}")))?;

        SignedEvent::from_bytes(&signed_event_bytes)
            .map_err(|e| CoreError::Crypto(format!("Event signature invalid: {e:?}")))?;

        Ok(signed_event_bytes)
    }

    /// Returns serialized `ListEventsResponse` proto bytes for the
    /// non-tombstoned events on (identity, collection).
    pub fn list_valid_events(
        &self,
        identity: String,
        collection: i32,
    ) -> Result<Vec<u8>, CoreError> {
        let event_bundles = self
            .client
            .lock()
            .unwrap()
            .list_valid_events(&identity, collection)
            .map_err(|e| CoreError::Store(format!("list_valid_events: {e}")))?;

        let response = ListEventsResponse {
            event_bundles,
            previous_token: String::new(),
            next_token: String::new(),
        };

        Ok(response.encode_to_vec())
    }

    /// Decode `image`, resize to `width`x`height` per `mode` ("fill" or
    /// "fit"), encode as JPEG.
    pub fn process_image_to_jpeg(
        &self,
        image: Vec<u8>,
        width: u32,
        height: u32,
        mode: String,
    ) -> Result<Vec<u8>, CoreError> {
        let mode = match mode.as_str() {
            "fit" => process_image::ResizeMode::Fit,
            _ => process_image::ResizeMode::Fill,
        };
        process_image::process_image(&image, width, height, mode)
            .map_err(|e| CoreError::Image(format!("process_image failed: {e}")))
    }

    // ── Network ops (gRPC / gRPC-web) ──────────────────────────────

    /// Fetch events from a server. Returns serialized
    /// `ListEventsResponse` proto bytes.
    #[allow(clippy::too_many_arguments)]
    pub async fn list_events(
        &self,
        server_url: String,
        size: Option<i32>,
        identity: Option<String>,
        collection: Option<i32>,
        signed_by: Option<Vec<u8>>,
        signed_by_key_type: Option<i32>,
        sequence_gt: Option<i64>,
        sequence_lt: Option<i64>,
    ) -> Result<Vec<u8>, CoreError> {
        let mut client = EventSyncServiceClient::new(channel(&server_url)?);

        let filters = ListEventsFilters {
            collection,
            identity,
            signed_by: signed_by.map(|key| PublicKey {
                key_type: signed_by_key_type.unwrap_or(1),
                key,
            }),
            sequence_gt,
            sequence_lt,
        };

        let response = client
            .list_events(ListEventsRequest {
                filters: Some(filters),
                size,
            })
            .await
            .map_err(|e| CoreError::Network(format!("list_events: {e}")))?;

        Ok(response.into_inner().encode_to_vec())
    }

    /// Push event bundles to a server.
    pub async fn put_events(
        &self,
        server_url: String,
        event_bundles_bytes: Vec<u8>,
    ) -> Result<(), CoreError> {
        let request = PutEventsRequest::decode(event_bundles_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode PutEventsRequest: {e}")))?;
        let mut client = EventSyncServiceClient::new(channel(&server_url)?);
        client
            .put_events(request)
            .await
            .map_err(|e| CoreError::Network(format!("put_events: {e}")))?;
        Ok(())
    }

    /// Fetch the feed of posts authored by `identity`. Returns serialized
    /// `GetFeedResponse` proto bytes.
    pub async fn get_identity_feed(
        &self,
        server_url: String,
        identity: String,
        limit: Option<i32>,
        before_token: Option<String>,
        after_token: Option<String>,
    ) -> Result<Vec<u8>, CoreError> {
        let mut client = FeedsServiceClient::new(channel(&server_url)?);
        let response = client
            .get_identity_feed(GetIdentityFeedRequest {
                identity,
                page_params: Some(FeedPageParams {
                    limit,
                    before_token,
                    after_token,
                }),
            })
            .await
            .map_err(|e| CoreError::Network(format!("get_identity_feed: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
    }

    /// Fetch the feed of posts from identities the caller follows. When
    /// `follower_identity` is `None` the server uses the authenticated
    /// caller's follow graph.
    pub async fn get_following_feed(
        &self,
        server_url: String,
        follower_identity: Option<String>,
        limit: Option<i32>,
        before_token: Option<String>,
        after_token: Option<String>,
    ) -> Result<Vec<u8>, CoreError> {
        let mut client = FeedsServiceClient::new(channel(&server_url)?);
        let response = client
            .get_following_feed(GetFollowingFeedRequest {
                follower_identity,
                page_params: Some(FeedPageParams {
                    limit,
                    before_token,
                    after_token,
                }),
            })
            .await
            .map_err(|e| CoreError::Network(format!("get_following_feed: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
    }

    /// Fetch the server-curated explore feed of posts relevant to `identity`.
    pub async fn get_explore_feed(
        &self,
        server_url: String,
        identity: Option<String>,
        limit: Option<i32>,
        before_token: Option<String>,
        after_token: Option<String>,
    ) -> Result<Vec<u8>, CoreError> {
        let mut client = FeedsServiceClient::new(channel(&server_url)?);
        let response = client
            .get_explore_feed(GetExploreFeedRequest {
                identity,
                page_params: Some(FeedPageParams {
                    limit,
                    before_token,
                    after_token,
                }),
            })
            .await
            .map_err(|e| CoreError::Network(format!("get_explore_feed: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
    }

    /// Fetch a parent post and its direct replies. Returns serialized
    /// `GetPostThreadResponse` proto bytes.
    pub async fn get_post_thread(
        &self,
        server_url: String,
        request_bytes: Vec<u8>,
    ) -> Result<Vec<u8>, CoreError> {
        let request = GetPostThreadRequest::decode(request_bytes.as_slice()).map_err(|e| {
            CoreError::Decode(format!("Failed to decode GetPostThreadRequest: {e}"))
        })?;
        let mut client = FeedsServiceClient::new(channel(&server_url)?);
        let response = client
            .get_post_thread(request)
            .await
            .map_err(|e| CoreError::Network(format!("get_post_thread: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
    }

    /// Fetch a server's public info. Returns serialized
    /// `GetServerInfoResponse` proto bytes.
    pub async fn get_server_info(&self, server_url: String) -> Result<Vec<u8>, CoreError> {
        let mut client = ServerServiceClient::new(channel(&server_url)?);
        let response = client
            .get_info(GetServerInfoRequest {})
            .await
            .map_err(|e| CoreError::Network(format!("get_server_info: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
    }

    /// Upload a blob body to a server. The server verifies that `body`
    /// matches the declared `Blob.digest`.
    pub async fn upload_blob(
        &self,
        server_url: String,
        request_bytes: Vec<u8>,
    ) -> Result<(), CoreError> {
        let request = UploadBlobRequest::decode(request_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode UploadBlobRequest: {e}")))?;
        let mut client = ContentServiceClient::new(channel(&server_url)?);
        client
            .upload_blob(request)
            .await
            .map_err(|e| CoreError::Network(format!("upload_blob: {e}")))?;
        Ok(())
    }

    /// Create a pairing session on the server. `signed_message_bytes` is a
    /// serialized `SignedMessage` wrapping an `InitialPairingSession`.
    /// Returns serialized `PairingSession` proto bytes.
    pub async fn create_pairing_session(
        &self,
        server_url: String,
        signed_message_bytes: Vec<u8>,
    ) -> Result<Vec<u8>, CoreError> {
        let signed = SignedMessage::decode(signed_message_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode SignedMessage: {e}")))?;
        let mut client = PairingServiceClient::new(channel(&server_url)?);
        let response = client
            .create_pairing_session(CreatePairingSessionRequest {
                signed_message: Some(signed),
            })
            .await
            .map_err(|e| CoreError::Network(format!("create_pairing_session: {e}")))?;
        let session = response
            .into_inner()
            .session
            .ok_or_else(|| CoreError::Network("create_pairing_session: missing session".into()))?;
        Ok(session.encode_to_vec())
    }

    /// Fetch a pairing session by its signature. Returns serialized
    /// `PairingSession` proto bytes.
    pub async fn get_pairing_session(
        &self,
        server_url: String,
        pairing_session_signature: String,
    ) -> Result<Vec<u8>, CoreError> {
        let mut client = PairingServiceClient::new(channel(&server_url)?);
        let response = client
            .get_pairing_session(GetPairingSessionRequest {
                pairing_session_signature,
            })
            .await
            .map_err(|e| CoreError::Network(format!("get_pairing_session: {e}")))?;
        let session = response
            .into_inner()
            .session
            .ok_or_else(|| CoreError::Network("get_pairing_session: missing session".into()))?;
        Ok(session.encode_to_vec())
    }

    /// Join an existing pairing session. `signed_message_bytes` is a
    /// serialized `SignedMessage` wrapping a `JoinPairingSessionBody`.
    /// Returns serialized `PairingSession` proto bytes.
    pub async fn join_pairing_session(
        &self,
        server_url: String,
        signed_message_bytes: Vec<u8>,
    ) -> Result<Vec<u8>, CoreError> {
        let signed = SignedMessage::decode(signed_message_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode SignedMessage: {e}")))?;
        let mut client = PairingServiceClient::new(channel(&server_url)?);
        let response = client
            .join_pairing_session(JoinPairingSessionRequest {
                signed_message: Some(signed),
            })
            .await
            .map_err(|e| CoreError::Network(format!("join_pairing_session: {e}")))?;
        let session = response
            .into_inner()
            .session
            .ok_or_else(|| CoreError::Network("join_pairing_session: missing session".into()))?;
        Ok(session.encode_to_vec())
    }

    /// Register a push notification token. `signed_message_bytes` is a
    /// serialized `SignedMessage` wrapping a
    /// `RegisterPushNotificationRequest`.
    pub async fn register_push_notifications(
        &self,
        server_url: String,
        signed_message_bytes: Vec<u8>,
    ) -> Result<(), CoreError> {
        let signed = SignedMessage::decode(signed_message_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode SignedMessage: {e}")))?;
        let mut client = NotificationServiceClient::new(channel(&server_url)?);
        client
            .register_push_notifications(signed)
            .await
            .map_err(|e| CoreError::Network(format!("register_push_notifications: {e}")))?;
        Ok(())
    }
}
