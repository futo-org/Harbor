use crate::platform::error::PlatformError;
use js_sys::Uint8Array;
use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, Event, ListEventsRequest, PublicKey,
    PutEventsRequest, SignedEvent,
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
pub struct PolycentricWasm {}

#[wasm_bindgen]
impl PolycentricWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {}
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

    /// Decode an event from a signed event's event_bytes field.
    ///
    /// # Arguments
    /// * `signed_event` - Serialized SignedEvent protobuf bytes
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The serialized Event bytes or error
    #[wasm_bindgen]
    pub fn decode_event_from_signed_event(
        &self,
        signed_event: &[u8],
    ) -> std::result::Result<Uint8Array, JsValue> {
        let signed_event = SignedEvent::decode(signed_event)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode signed event: {}", e)))?;

        let event = Event::decode(signed_event.event_bytes.as_slice())
            .map_err(|e| JsValue::from_str(&format!("Failed to decode event: {}", e)))?;

        let bytes = event.encode_to_vec();
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
    ///
    /// # Arguments
    /// * `server_url` - The base URL of the gRPC-web server (e.g. "http://localhost:50051")
    /// * `limit` - Maximum number of events to fetch
    /// * `identity` - Optional serialized Identity message bytes to filter by
    /// * `stream_id` - Optional stream ID to filter by
    /// * `signed_by` - Optional public key bytes to filter by
    /// * `signed_by_key_type` - Key type for signed_by (required if signed_by is set)
    ///
    /// # Returns
    /// * Serialized ListEventsResponse protobuf bytes
    #[wasm_bindgen]
    pub async fn list_events(
        &self,
        server_url: &str,
        limit: Option<i32>,
        identity: Option<String>,
        collection: Option<i32>,
        signed_by: Option<Vec<u8>>,
        signed_by_key_type: Option<i32>,
    ) -> std::result::Result<Uint8Array, JsValue> {
        let mut client = Self::create_client(server_url);

        let response = client
            .list_events(ListEventsRequest {
                limit,
                identity,
                collection,
                signed_by: signed_by.map(|key| PublicKey {
                    key_type: signed_by_key_type.unwrap_or(1),
                    key,
                }),
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
