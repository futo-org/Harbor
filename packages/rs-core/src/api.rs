use crate::client::PolycentricClient;
use crate::media::process_image;
use crate::sync;
use polycentric_common::models::protos_v2::{
    ContentDigest, CreatePairingSessionRequest, Event, GetPairingSessionRequest,
    GetServerInfoRequest, Identity, JoinPairingSessionRequest, ListEventsResponse, PublicKey,
    PutEventsRequest, SetBanStatusRequest, SignedEvent, SignedMessage, UploadBlobRequest,
    UrlInfoRequest, content_service_client::ContentServiceClient,
    event_sync_service_client::EventSyncServiceClient,
    identity_service_client::IdentityServiceClient,
    notification_service_client::NotificationServiceClient,
    pairing_service_client::PairingServiceClient, server_service_client::ServerServiceClient,
};
use polycentric_common::models::protos_v2::{ListHeadsRequest, PutEventsResponse};
use polycentric_common::models::traits::Serializable;
use prost::Message;
use std::sync::{Arc, Mutex};

#[cfg(all(not(target_arch = "wasm32"), not(feature = "native-transport")))]
compile_error!("rs-core on a non-wasm target requires the `native-transport` feature.");

async fn channel(server_url: &str) -> Result<crate::query::GrpcChannel, CoreError> {
    crate::query::channel(server_url)
        .await
        .map_err(CoreError::Network)
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

/// Discriminated union over every observable RPC. `fetch_query`
/// matches on a variant and dispatches to the corresponding helper.
/// Adding a new observable RPC means adding a variant here and a
/// match arm in `fetch_query` — no new FFI method required.
#[derive(uniffi::Enum)]
pub enum Query {
    GetProfile(crate::query::profile::GetProfileArgs),
    GetEvent(crate::query::event::GetEventArgs),
    GetPostThread(crate::query::feed::GetPostThreadArgs),
    GetIdentityFeed(crate::query::feed::GetIdentityFeedArgs),
    GetFollowingFeed(crate::query::feed::GetFollowingFeedArgs),
    GetExploreFeed(crate::query::feed::GetExploreFeedArgs),
    ListNotifications(crate::query::notification::ListNotificationsArgs),
    ListEvents(crate::query::event::ListEventsArgs),
    ListVerificationClaims(crate::query::verifications::ListVerificationClaimsArgs),
    ListVerificationTargets(crate::query::verifications::ListVerificationTargetsArgs),
    ListVerificationVerifies(crate::query::verifications::ListVerificationVerifiesArgs),
    ListTargetedVerificationClaims(crate::query::verifications::ListTargetedVerificationClaimsArgs),
    ListFollowing(crate::query::graph::ListFollowingArgs),
    ListFollowers(crate::query::graph::ListFollowersArgs),
    IsModerator(crate::query::moderation::IsModeratorArgs),
    IsBanned(crate::query::moderation::IsBannedArgs),
    ListBans(crate::query::moderation::ListBansArgs),
}

#[uniffi::export(with_foreign)]
#[async_trait::async_trait]
pub trait SignBytesCallback: Send + Sync {
    async fn sign(&self, bytes: Vec<u8>) -> Result<Vec<u8>, CoreError>;
}

#[derive(uniffi::Object)]
pub struct PolycentricCore {
    client: Arc<Mutex<PolycentricClient>>,
    query_client: crate::query::QueryClient<Vec<u8>>,
}

#[cfg_attr(not(target_arch = "wasm32"), uniffi::export(async_runtime = "tokio"))]
#[cfg_attr(target_arch = "wasm32", uniffi::export)]
impl PolycentricCore {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        #[cfg(target_arch = "wasm32")]
        console_error_panic_hook::set_once();

        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        Arc::new(Self {
            query_client: crate::query::QueryClient::new(client.clone()),
            client,
        })
    }

    /// Replace the list of gRPC servers the core's `Observable`-returning
    /// methods will fan out to.
    pub fn set_servers(&self, servers: Vec<String>) {
        self.client.lock().unwrap().set_servers(servers);
    }

    /// Register the provider consulted for the auth token attached to every
    /// outgoing gRPC request.
    pub fn set_auth_token_provider(
        &self,
        provider: Arc<dyn crate::query::auth::AuthTokenProvider>,
    ) {
        crate::query::auth::set_auth_token_provider(provider);
    }

    /// Drop every cached auth token — e.g. when the active identity changes.
    pub fn clear_auth_tokens(&self) {
        crate::query::auth::clear_auth_tokens();
    }

    /// Return a snapshot of the currently configured servers.
    pub fn get_servers(&self) -> Vec<String> {
        self.client.lock().unwrap().servers()
    }

    pub fn next_sequence(&self, identity: String, collection: i32) -> u64 {
        self.client
            .lock()
            .unwrap()
            .next_sequence(&identity, collection)
    }

    /// Max sequence of identity events signed by `signer` for `identity`,
    /// or `None` if this signer has no identity events.
    pub fn get_identity_sequence(
        &self,
        identity: String,
        signer: Vec<u8>,
    ) -> Result<Option<u64>, CoreError> {
        let pk = PublicKey::decode(signer.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode signer: {e}")))?;
        Ok(self
            .client
            .lock()
            .unwrap()
            .get_identity_sequence(&identity, &pk))
    }

    /// Merkle root over the canonically-ordered signatures in
    /// `(identity, collection)`. Empty when no events exist.
    pub fn previous_root(&self, identity: String, collection: i32) -> Vec<u8> {
        self.client
            .lock()
            .unwrap()
            .previous_root(&identity, collection)
    }

    /// Signature of the canonically-latest event in `(identity, collection)`.
    /// Empty when no events exist.
    pub fn previous_signature(&self, identity: String, collection: i32) -> Vec<u8> {
        self.client
            .lock()
            .unwrap()
            .previous_signature(&identity, collection)
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
            if let Err(e) = client.copy_content(&digest, entry.content_bytes) {
                // Skip content that doesn't match its digest; keep the rest.
                crate::logging::log_warn(|| format!("dropping content: {e}"));
            }
        }
        Ok(())
    }

    /// Build a vector clock (returns serialized `VectorClock` proto bytes).
    /// For identity events, callers should pass the new event's identity
    /// content as `identity_content` (serialized `Identity` proto bytes).
    /// For other events, leave it `None`.
    pub fn build_vector_clock(
        &self,
        identity: String,
        collection: i32,
        identity_sequence: u64,
        signed_by: Vec<u8>,
        current_sequence: u64,
        identity_content: Option<Vec<u8>>,
    ) -> Result<Vec<u8>, CoreError> {
        let pk = PublicKey::decode(signed_by.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode signed_by: {e}")))?;
        let identity_content_decoded = identity_content
            .map(|bytes| Identity::decode(bytes.as_slice()))
            .transpose()
            .map_err(|e| CoreError::Decode(format!("Failed to decode identity_content: {e}")))?;
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
                identity_content_decoded,
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
        callback: Arc<dyn SignBytesCallback>,
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
            event_hints: Vec::new(),
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
    ) -> Result<process_image::ProcessedImage, CoreError> {
        let mode = match mode.as_str() {
            "fit" => process_image::ResizeMode::Fit,
            _ => process_image::ResizeMode::Fill,
        };
        process_image::process_image(&image, width, height, mode)
            .map_err(|e| CoreError::Image(format!("process_image failed: {e}")))
    }

    // ── Network ops (gRPC / gRPC-web) ──────────────────────────────

    /// Unified entry point for every observable RPC.
    /// `query` selects which RPC to run and supplies its parameters.
    /// `query_key` is the cache key shared across subscribers.
    /// Pass in `None` to bypass the cache.
    /// `opts` carries the optional fetch mode and per-call servers override.
    /// Always returns a `QueryObservable` regardless of variant.
    pub fn fetch_query(
        &self,
        query_key: Option<crate::query::QueryKey>,
        query: Query,
        opts: Option<crate::query::QueryOpts>,
    ) -> Arc<dyn crate::query::QueryObservable> {
        match query {
            Query::GetProfile(args) => {
                crate::query::profile::get_profile(&self.query_client, query_key, args, opts)
            }
            Query::GetEvent(args) => {
                crate::query::event::get_event(&self.query_client, query_key, args, opts)
            }
            Query::GetPostThread(args) => {
                crate::query::feed::get_post_thread(&self.query_client, query_key, args, opts)
            }
            Query::GetIdentityFeed(args) => {
                crate::query::feed::get_identity_feed(&self.query_client, query_key, args, opts)
            }
            Query::GetFollowingFeed(args) => {
                crate::query::feed::get_following_feed(&self.query_client, query_key, args, opts)
            }
            Query::GetExploreFeed(args) => {
                crate::query::feed::get_explore_feed(&self.query_client, query_key, args, opts)
            }
            Query::ListNotifications(args) => crate::query::notification::list_notifications(
                &self.query_client,
                query_key,
                args,
                opts,
            ),
            Query::ListEvents(args) => {
                crate::query::event::list_events(&self.query_client, query_key, args, opts)
            }
            Query::ListVerificationClaims(args) => {
                crate::query::verifications::list_verification_claims(
                    &self.query_client,
                    query_key,
                    args,
                    opts,
                )
            }
            Query::ListVerificationTargets(args) => {
                crate::query::verifications::list_verification_targets(
                    &self.query_client,
                    query_key,
                    args,
                    opts,
                )
            }
            Query::ListVerificationVerifies(args) => {
                crate::query::verifications::list_verification_verifies(
                    &self.query_client,
                    query_key,
                    args,
                    opts,
                )
            }
            Query::ListTargetedVerificationClaims(args) => {
                crate::query::verifications::list_targeted_verification_claims(
                    &self.query_client,
                    query_key,
                    args,
                    opts,
                )
            }
            Query::ListFollowing(args) => {
                crate::query::graph::list_following(&self.query_client, query_key, args, opts)
            }
            Query::ListFollowers(args) => {
                crate::query::graph::list_followers(&self.query_client, query_key, args, opts)
            }
            Query::IsModerator(args) => {
                crate::query::moderation::is_moderator(&self.query_client, query_key, args, opts)
            }
            Query::IsBanned(args) => {
                crate::query::moderation::is_banned(&self.query_client, query_key, args, opts)
            }
            Query::ListBans(args) => {
                crate::query::moderation::list_bans(&self.query_client, query_key, args, opts)
            }
        }
    }

    /// Clear the cache for a query key and discard the responses for any
    /// in-flight merge queries.
    pub fn invalidate_query(&self, query_key: crate::query::QueryKey) {
        self.query_client.invalidate(&query_key);
    }

    /// Clear the cache of every query key, e.g. after the configured
    /// server list changes.
    pub fn invalidate_all_queries(&self) {
        self.query_client.invalidate_all();
    }

    /// Push event bundles to a server.
    /// Returns the response from the server with any errors and missing blobs.
    pub async fn put_events(
        &self,
        server_url: String,
        event_bundles_bytes: Vec<u8>,
    ) -> Result<Vec<u8>, CoreError> {
        let request = PutEventsRequest::decode(event_bundles_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode PutEventsRequest: {e}")))?;

        let mut client = EventSyncServiceClient::new(channel(&server_url).await?);
        let response = client
            .put_events(request)
            .await
            .map_err(|e| CoreError::Network(format!("put_events: {e}")))?
            .into_inner();

        let response_bytes = PutEventsResponse::encode_to_vec(&response);
        Ok(response_bytes)
    }

    /// List latest known sequence numbers from a server for a single identity.
    pub async fn list_heads(
        &self,
        server_url: String,
        request_bytes: Vec<u8>,
    ) -> Result<Vec<u8>, CoreError> {
        let request = ListHeadsRequest::decode(request_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode ListHeadsRequest: {e}")))?;

        let mut client = EventSyncServiceClient::new(channel(&server_url).await?);

        let response = client
            .list_heads(request)
            .await
            .map_err(|e| CoreError::Network(format!("list_heads: {e}")))?;

        Ok(response.into_inner().encode_to_vec())
    }

    /// Push events belonging to `identity` to remote `server`.
    /// Pushes all relevant local events if `partial` is false.
    /// Otherwise, only push events that we believe the server to be missing.
    /// The server's response is returned (if there is one), so that the caller
    /// can handle error and/or push blobs.
    pub async fn push_local_events(
        &self,
        identity: String,
        server: String,
        partial: bool,
    ) -> Result<Option<Vec<u8>>, CoreError> {
        let bundles = if partial {
            let heads = sync::request_heads(&identity, &server).await?;
            let client = self.client.lock().unwrap();
            sync::bundle_unsent_events(&client, &identity, heads)?
        } else {
            let client = self.client.lock().unwrap();
            sync::bundle_local_events(&client, &identity)?
        };

        if !bundles.is_empty() {
            let response = sync::push_bundles(&server, bundles).await?;
            let encoded = PutEventsResponse::encode_to_vec(&response);
            Ok(Some(encoded))
        } else {
            Ok(None)
        }
    }

    /// Fetch a server's public info. Returns serialized
    /// `GetServerInfoResponse` proto bytes.
    pub async fn get_server_info(&self, server_url: String) -> Result<Vec<u8>, CoreError> {
        let mut client = ServerServiceClient::new(channel(&server_url).await?);
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
        let mut client = ContentServiceClient::new(channel(&server_url).await?);
        client
            .upload_blob(request)
            .await
            .map_err(|e| CoreError::Network(format!("upload_blob: {e}")))?;
        Ok(())
    }

    /// Ban or unban an identity on a server. `request_bytes` is a
    /// serialized `SetBanStatusRequest`. Returns serialized
    /// `SetBanStatusResponse` proto bytes. Requires the caller (bearer
    /// JWT) to be a moderator on the server.
    pub async fn set_ban_status(
        &self,
        server_url: String,
        request_bytes: Vec<u8>,
    ) -> Result<Vec<u8>, CoreError> {
        let request = SetBanStatusRequest::decode(request_bytes.as_slice())
            .map_err(|e| CoreError::Decode(format!("Failed to decode SetBanStatusRequest: {e}")))?;
        let mut client = IdentityServiceClient::new(channel(&server_url).await?);
        let response = client
            .set_ban_status(tonic::Request::new(request))
            .await
            .map_err(|e| CoreError::Network(format!("set_ban_status: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
    }

    /// Fetch link-preview metadata for `url` from a server's unfurl endpoint.
    /// Returns serialized `Link` proto bytes.
    pub async fn url_info(&self, server_url: String, url: String) -> Result<Vec<u8>, CoreError> {
        let mut client = ContentServiceClient::new(channel(&server_url).await?);
        let response = client
            .url_info(UrlInfoRequest { url })
            .await
            .map_err(|e| CoreError::Network(format!("url_info: {e}")))?;
        Ok(response.into_inner().encode_to_vec())
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
        let mut client = PairingServiceClient::new(channel(&server_url).await?);
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
        let mut client = PairingServiceClient::new(channel(&server_url).await?);
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
        let mut client = PairingServiceClient::new(channel(&server_url).await?);
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
        let mut client = NotificationServiceClient::new(channel(&server_url).await?);
        client
            .register_push_notifications(signed)
            .await
            .map_err(|e| CoreError::Network(format!("register_push_notifications: {e}")))?;
        Ok(())
    }
}
