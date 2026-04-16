use crate::client::PolycentricClient;
use crate::platform::error::PlatformError;
use js_sys::Uint8Array;
use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, ContentDigest, Event, ListEventsFilters,
    ListEventsRequest, PublicKey, PutEventsRequest, SignedEvent,
};
use polycentric_common::models::traits::Serializable;
use prost::Message;
use tonic_web_wasm_client::Client as GrpcWebClient;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "(eventBytes: Uint8Array) => Promise<Uint8Array>")]
    pub type SignEventCallback;

    #[wasm_bindgen(typescript_type = "(signedEventBytes: Uint8Array) => Promise<void>")]
    pub type CommitEventCallback;

    #[wasm_bindgen(typescript_type = "Uint8Array[]")]
    pub type SignedEventBytesArray;

    #[wasm_bindgen(typescript_type = "Uint8Array[]")]
    pub type BytesArray;

    #[wasm_bindgen(typescript_type = "Map<Uint8Array, Uint8Array>")]
    pub type ContentMap;
}

#[cfg(target_arch = "wasm32")]
use web_sys::console;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn wasm_init_panic_hook() {
    console::log_1(&"Setting panic hook".into());
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct PolycentricWasm {
    client: PolycentricClient,
}

#[wasm_bindgen]
impl PolycentricWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            client: PolycentricClient::new(),
        }
    }

    /// Return the next sequence for a (identity, collection, signer) stream.
    ///
    /// # Arguments
    /// * `identity` - Identity key (hex hash)
    /// * `collection` - Collection ID
    /// * `signed_by` - Serialized `PublicKey` proto bytes
    ///
    /// # Returns
    /// * `u64` - max observed sequence + 1, or 1 if the stream is empty
    #[wasm_bindgen]
    pub fn next_sequence(
        &self,
        identity: &str,
        collection: i32,
        signed_by: &[u8],
    ) -> std::result::Result<u64, JsValue> {
        let pk = PublicKey::decode(signed_by)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode signed_by: {e}")))?;
        Ok(self
            .client
            .next_sequence(identity, collection, pk.key_type, &pk.key))
    }

    /// Copy signed events to the event store.
    ///
    /// # Arguments
    /// * `signed_events` - JS `Array` of `Uint8Array`, each a serialized
    ///   `SignedEvent`. Each event has its signature verified before being
    ///   inserted into the local event store.
    #[wasm_bindgen]
    pub fn copy_events(
        &mut self,
        signed_events: SignedEventBytesArray,
    ) -> std::result::Result<(), JsValue> {
        let array: &js_sys::Array = signed_events.unchecked_ref();

        for item in array.iter() {
            let bytes = Uint8Array::unchecked_from_js(item).to_vec();

            // Decode + verify the signature in one step.
            let signed_event = SignedEvent::from_bytes(&bytes)
                .map_err(|e| JsValue::from_str(&format!("Invalid signed event: {:?}", e)))?;

            self.client
                .copy_event(signed_event)
                .map_err(|e| JsValue::from_str(&format!("Failed to copy event: {:?}", e)))?;
        }

        Ok(())
    }

    /// Copy multiple content entries into the content store.
    ///
    /// # Arguments
    /// * `content_map` - JS `Map<Uint8Array, Uint8Array>` where keys are
    ///   serialized `ContentDigest` protos and values are serialized
    ///   `Content` protos.
    #[wasm_bindgen]
    pub fn copy_contents(&mut self, content_map: ContentMap) -> std::result::Result<(), JsValue> {
        let map: &js_sys::Map = content_map.unchecked_ref();

        map.entries()
            .into_iter()
            .try_for_each(|entry| -> std::result::Result<(), JsValue> {
                let pair: js_sys::Array = entry
                    .map_err(|e| JsValue::from_str(&format!("Map iteration error: {:?}", e)))?
                    .unchecked_into();
                let digest_bytes = Uint8Array::unchecked_from_js(pair.get(0)).to_vec();
                let content_bytes = Uint8Array::unchecked_from_js(pair.get(1)).to_vec();

                let digest = ContentDigest::decode(digest_bytes.as_slice()).map_err(|e| {
                    JsValue::from_str(&format!("Failed to decode ContentDigest: {e}"))
                })?;
                self.client.copy_content(&digest, content_bytes);
                Ok(())
            })
    }

    /// Build a vector clock for a single collection within an identity.
    ///
    /// Resolves the Identity document at `identity_sequence` from the
    /// local store, reads its authorized keys, and produces a
    /// `VectorClock` whose sequence entries are in identity-document key
    /// order. The current signer's entry is overlaid with
    /// `current_sequence` (the sequence of the event being built).
    ///
    /// # Arguments
    /// * `identity` - Identity key (hex hash)
    /// * `collection` - Collection ID the event belongs to
    /// * `identity_sequence` - Sequence of the identity-collection event
    ///   the signer is referencing
    /// * `signed_by` - Serialized `PublicKey` proto bytes of the signer
    /// * `current_sequence` - Sequence of the event being built
    ///
    /// # Returns
    /// Serialized `VectorClock` proto bytes.
    #[wasm_bindgen]
    pub fn build_vector_clock(
        &self,
        identity: &str,
        collection: i32,
        identity_sequence: u64,
        signed_by: &[u8],
        current_sequence: u64,
    ) -> std::result::Result<Uint8Array, JsValue> {
        let pk = PublicKey::decode(signed_by)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode signed_by: {e}")))?;

        let clock = self
            .client
            .build_vector_clock(
                identity,
                collection,
                identity_sequence,
                &pk,
                current_sequence,
            )
            .map_err(|e| JsValue::from_str(&format!("build_vector_clock: {e}")))?;

        Ok(Uint8Array::from(&clock.encode_to_vec()[..]))
    }

    /// Decode and verify a signed event from bytes.
    ///
    /// # Arguments
    /// * `signed_event` - Serialized SignedEvent protobuf bytes
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The verified SignedEvent bytes or error
    #[wasm_bindgen]
    pub fn verify_signed_event(
        &self,
        signed_event: &[u8],
    ) -> std::result::Result<Uint8Array, JsValue> {
        let signed_event = SignedEvent::from_bytes(signed_event)
            .map_err(|e| JsValue::from_str(&format!("Failed to verify signed event: {}", e)))?;

        let bytes = signed_event
            .to_bytes()
            .map_err(|e| JsValue::from_str(&format!("Failed to encode signed event: {}", e)))?;

        Ok(Uint8Array::from(&bytes[..]))
    }

    /// Sign event bytes via a JS callback
    ///
    /// # Arguments
    /// * `event_bytes` - Serialized Event protobuf bytes to sign
    /// * `sign_event` - JS callback: (Uint8Array) => Promise<Uint8Array> that returns SignedEvent bytes
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The signed event bytes
    #[wasm_bindgen]
    pub async fn sign_event(
        &self,
        event_bytes: &[u8],
        callback: &SignEventCallback,
    ) -> std::result::Result<Uint8Array, JsValue> {
        // Validate event_bytes is a valid Event
        Event::decode(event_bytes).map_err(|e| {
            PlatformError::DeserializationError(format!("Invalid event bytes: {}", e))
        })?;

        let func: &js_sys::Function = callback.unchecked_ref();
        let sign_promise = func
            .call1(&JsValue::NULL, &Uint8Array::from(event_bytes))
            .map_err(|e| PlatformError::CallbackError(format!("Failed to sign event: {:?}", e)))?;

        let signed_event_js = JsFuture::from(js_sys::Promise::from(sign_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to await signed event: {:?}", e))
            })?;

        let signature = signed_event_js
            .dyn_into::<Uint8Array>()
            .map_err(|_| {
                PlatformError::CallbackError(
                    "Expected Uint8Array from sign_event callback".to_string(),
                )
            })?
            .to_vec();

        let signed_event = SignedEvent {
            signature,
            event_bytes: event_bytes.to_vec(),
        };

        let signed_event_bytes = signed_event.to_bytes().unwrap();

        // Verify the signature
        SignedEvent::from_bytes(&signed_event_bytes)
            .map_err(|e| PlatformError::CryptoError(format!("Event signature invalid: {:?}", e)))?;

        Ok(Uint8Array::from(&signed_event_bytes[..]))
    }

    /// Fetch events from a server via gRPC-web.
    #[wasm_bindgen]
    #[allow(clippy::too_many_arguments)]
    pub async fn list_events(
        &self,
        server_url: &str,
        size: Option<i32>,
        identity: Option<String>,
        collection: Option<i32>,
        signed_by: Option<Vec<u8>>,
        signed_by_key_type: Option<i32>,
        sequence_gt: Option<i64>,
        sequence_lt: Option<i64>,
    ) -> std::result::Result<Uint8Array, JsValue> {
        let mut client = Self::create_client(server_url);

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
            .map_err(|e| JsValue::from_str(&format!("gRPC list_events failed: {}", e)))?;

        let bytes = response.into_inner().encode_to_vec();
        Ok(Uint8Array::from(&bytes[..]))
    }

    /// Push event bundles to a server via gRPC-web.
    ///
    /// # Arguments
    /// * `server_url` - The base URL of the gRPC-web server
    /// * `event_bundles_bytes` - Serialized PutEventsRequest protobuf bytes
    #[wasm_bindgen]
    pub async fn put_events(
        &self,
        server_url: &str,
        event_bundles_bytes: &[u8],
    ) -> std::result::Result<(), JsValue> {
        let request = PutEventsRequest::decode(event_bundles_bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode PutEventsRequest: {}", e)))?;

        let mut client = Self::create_client(server_url);

        client
            .put_events(request)
            .await
            .map_err(|e| JsValue::from_str(&format!("gRPC put_events failed: {}", e)))?;

        Ok(())
    }
}

impl PolycentricWasm {
    fn create_client(server_url: &str) -> EventSyncServiceClient<GrpcWebClient> {
        let web_client = GrpcWebClient::new(server_url.to_string());
        EventSyncServiceClient::new(web_client)
    }
}

impl Default for PolycentricWasm {
    fn default() -> Self {
        Self::new()
    }
}
