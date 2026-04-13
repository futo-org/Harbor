use crate::platform::error::PlatformError;
use js_sys::Uint8Array;
use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, Event, ListEventsRequest, PublicKey,
    PutEventsRequest, SignedEvent, VectorClock,
};
use polycentric_common::models::traits::Serializable;
use prost::Message;
use std::collections::{BTreeMap, BTreeSet};
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

    /// Build vector clocks summarising the latest sequence we've observed per
    /// (signer, collection) stream.
    ///
    /// # Arguments
    /// * `signed_by` - Raw public key bytes of the signer this event will be
    ///   built for. Pinned to signer-index 0 inside each VectorClock so the
    ///   caller's own stream is always listed first.
    /// * `signed_events` - JS `Array` of `Uint8Array`, each a serialized
    ///   `SignedEvent`.
    ///
    /// # Returns
    /// A JS `Array` where `arr[collection_id]` is a `Uint8Array` of the
    /// serialized `VectorClock` for that collection. The array is
    /// sparse-indexed by collection ID (matching `Event.vector_clocks`
    /// usage in the TS client). Slots for collections we've never seen are
    /// filled with an empty `VectorClock`. Inside each clock,
    /// `sequence[0]` is `signed_by`'s height for that collection (0 if the
    /// signer has no prior events in it), followed by the remaining
    /// observed signers in ascending byte order.
    #[wasm_bindgen]
    pub fn build_vector_clock(
        &self,
        signed_by: Option<Vec<u8>>,
        signed_events: js_sys::Array,
    ) -> std::result::Result<js_sys::Array, JsValue> {
        // 1. Group all signed_events by signed_by, tracking the max sequence
        //    observed per collection for each signer.
        let mut by_signer: BTreeMap<Vec<u8>, BTreeMap<i32, u64>> = BTreeMap::new();
        let mut collections: BTreeSet<i32> = BTreeSet::new();

        for item in signed_events.iter() {
            let event_bytes = item
                .dyn_into::<Uint8Array>()
                .map_err(|_| {
                    JsValue::from_str("signed_events must be an Array of Uint8Array entries")
                })?
                .to_vec();

            let signed_event = SignedEvent::decode(event_bytes.as_slice()).map_err(|e| {
                PlatformError::DeserializationError(format!("Failed to decode SignedEvent: {}", e))
            })?;

            let event = Event::decode(signed_event.event_bytes.as_slice()).map_err(|e| {
                PlatformError::DeserializationError(format!("Failed to decode Event: {}", e))
            })?;

            let key = event.key.ok_or_else(|| {
                PlatformError::DeserializationError("Event missing key".to_string())
            })?;

            let signer = key.signed_by.ok_or_else(|| {
                PlatformError::DeserializationError("EventKey missing signed_by".to_string())
            })?;

            collections.insert(key.collection);

            let per_collection = by_signer.entry(signer.key).or_default();
            per_collection
                .entry(key.collection)
                .and_modify(|existing| {
                    if key.sequence > *existing {
                        *existing = key.sequence;
                    }
                })
                .or_insert(key.sequence);
        }

        // 2. Build the signer ordering: `signed_by` pinned at index 0 (even if
        //    we've seen no prior events from it — its height becomes 0),
        //    followed by every other observed signer in deterministic order.
        let mut signer_order: Vec<Vec<u8>> = Vec::new();
        if let Some(ref pk) = signed_by {
            signer_order.push(pk.clone());
        }
        for other in by_signer.keys() {
            if signed_by.as_ref() != Some(other) {
                signer_order.push(other.clone());
            }
        }

        // 3. Emit one VectorClock per collection, sparse-indexed by collection
        //    ID. `arr[i]` is the clock for collection `i`; unused slots get
        //    empty clocks. This matches the convention the TS client uses
        //    when populating `Event.vector_clocks`.
        let out = js_sys::Array::new();
        let max_collection = collections.iter().copied().max().unwrap_or(0);

        for collection_id in 0..=max_collection {
            let mut clock = VectorClock::default();
            if collections.contains(&collection_id) {
                for signer in &signer_order {
                    let height = by_signer
                        .get(signer)
                        .and_then(|m| m.get(&collection_id))
                        .copied()
                        .unwrap_or(0);
                    clock.sequence.push(height);
                }
            }
            let bytes = clock.encode_to_vec();
            out.push(&Uint8Array::from(&bytes[..]));
        }

        Ok(out)
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
