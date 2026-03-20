use std::cell::Ref;
use std::cell::RefCell;
use std::cell::RefMut;

use crate::feeds::feed_helpers;
use crate::platform::error::PlatformError;
use crate::query::{EventRangeQuery, QueryEngine};
use crate::synchronization::sync_helpers::fetch_event_request;
use crate::synchronization::sync_helpers::prepare_sync_requests;
use js_sys::Array;
use js_sys::Boolean;
use js_sys::Reflect;
use js_sys::{BigInt, Date as JsDate, Error as JsError, Uint8Array};
use polycentric_common::models::internal::{EventKey, TimelineKey};
use polycentric_common::models::internal::{ProcessId, SystemKey};
use polycentric_common::models::protos::reference::ReferenceType;
use polycentric_common::models::protos::QueryReferencesRequestEvents;
use polycentric_common::models::protos::{
    ContentType, Event, EventCreationData, EventKey as ProtobufEventKey, Events, Indices, Pointer,
    Process, PublicKey, RangesForSystem, ResultEventsAndRelatedEventsAndCursor, SignedEvent,
    VectorClock,
};
use polycentric_common::models::protos::{
    QueryReferencesRequest, QueryReferencesResponse, Reference, RepeatedUInt64,
};
use polycentric_common::models::traits::Serializable;
use polycentric_common::models::Digest;
use prost::Message;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

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
    query_engine: Option<RefCell<QueryEngine>>,
}

#[wasm_bindgen]
impl PolycentricWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { query_engine: None }
    }

    fn get_engine_ref(&self) -> std::result::Result<Ref<'_, QueryEngine>, JsValue> {
        let engine_ref_cell = self
            .query_engine
            .as_ref()
            .ok_or_else(|| JsValue::from_str("PolycentricCore not initialized"))?;

        let result = engine_ref_cell.try_borrow();

        match result {
            Ok(engine) => Ok(engine),
            Err(_) => Err(JsValue::from_str("Somewhere a lock on the query engine is being held across an await. This is a bug with the rust core."))
        }
    }

    fn get_engine_mut(&self) -> std::result::Result<RefMut<'_, QueryEngine>, JsValue> {
        let engine_ref_cell = self
            .query_engine
            .as_ref()
            .ok_or_else(|| JsValue::from_str("PolycentricCore not initialized"))?;

        let result = engine_ref_cell.try_borrow_mut();

        match result {
            Ok(engine) => Ok(engine),
            Err(_) => Err(JsValue::from_str("Somewhere a lock on the query engine is being held across an await. This is a bug with the rust core."))
        }
    }

    fn js_result_and_errors(
        result: &JsValue,
        errors: Vec<PlatformError>,
    ) -> std::result::Result<JsValue, JsValue> {
        let value: JsValue = js_sys::Object::new().into();

        let js_errors_arr: Array = Array::new();

        for err in errors {
            let js_error = js_sys::Object::new().into();

            if let PlatformError::ServerError {
                ref server,
                error: _,
            } = err
            {
                Reflect::set(&js_error, &JsValue::from("server"), &JsValue::from(server))
                    .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;
            } else {
                Reflect::set(&js_error, &JsValue::from("server"), &JsValue::NULL)
                    .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;
            }

            Reflect::set(&js_error, &JsValue::from("error"), &JsValue::from(err))
                .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

            js_errors_arr.push(&js_error);
        }

        Reflect::set(&value, &JsValue::from("result"), result)
            .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

        Reflect::set(&value, &JsValue::from("errors"), &js_errors_arr)
            .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

        Ok(value)
    }

    /// Initialize the Polycentric Wasm core.
    ///
    /// # Returns
    /// * `Result<(), JsValue>` - Success or error
    #[wasm_bindgen]
    pub fn initialize(&mut self) -> std::result::Result<(), JsValue> {
        console::log_1(&"Initializing PolycentricWasm...".into());

        if self.query_engine.is_some() {
            let err_msg = "PolycentricWasm already initialized.";
            console::warn_1(&err_msg.into());
            return Err(JsError::new(err_msg).into());
        }

        self.query_engine = Some(RefCell::new(QueryEngine::new()));
        console::log_1(&"PolycentricWasm initialized successfully.".into());
        Ok(())
    }

    #[wasm_bindgen]
    pub fn initialized(&self) -> bool {
        self.query_engine.is_some()
    }

    /// Get the current Unix epoch time in milliseconds.
    ///
    /// # Returns
    /// * `u64` - Current time in milliseconds since Unix epoch
    #[wasm_bindgen]
    pub fn get_unix_epoch(&self) -> u64 {
        JsDate::now() as u64
    }

    /// Synchronize the events that we have with the events that a server has
    ///
    /// # Arguments
    /// * `system` - Serialized PublicKey protobuf bytes
    /// * `get_head` - Callback function which queries the GET /head endpoint of the server to sync with. Accepts a protobuf PublicKey and returns an Events object.
    /// * `get_ranges` - Callback function which queries the GET /ranges endpoint. Accepts a PublicKey and returns a RangesForSystem object
    /// * `get_events` - Callback function which queries the GET /events endpoint. Accepts a PublicKey and a RangesForSystem and returns an Events object.
    /// * `post_events` - Callback function which queries the POST /events endpoint. Accepts an Events object.
    /// * `persist_events` - Callback function to persist all events in a protobuf Events object
    #[wasm_bindgen]
    pub async fn sync_events_for_system(
        &self,
        system: &[u8],
        get_head: &js_sys::Function,
        get_ranges: &js_sys::Function,
        get_events: &js_sys::Function,
        post_events: &js_sys::Function,
        persist_events: &js_sys::Function,
    ) -> std::result::Result<JsValue, JsValue> {
        let mut errors: Vec<PlatformError> = vec![];

        let current_system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;

        let mut result = self
            .sync_events_for_target_system(
                &current_system_protobuf,
                &current_system_protobuf,
                get_head,
                get_ranges,
                get_events,
                Some(post_events),
                Some(persist_events),
            )
            .await?;
        errors.append(&mut result);

        let followed_profiles;
        let opinions;
        {
            let engine = self.get_engine_ref()?;

            let system_key = SystemKey::from_public_key(&current_system_protobuf);

            followed_profiles = engine.query_follows_for_system(&system_key).map_err(|e| {
                PlatformError::QueryError(format!("Unable to query followed profiles: {:?}", e))
            })?;
            opinions = engine.query_opinions_for_system(&system_key).map_err(|e| {
                PlatformError::QueryError(format!("Unable to query opinions: {:?}", e))
            })?;
        }

        for profile in followed_profiles {
            let mut result = self
                .sync_events_for_target_system(
                    &current_system_protobuf,
                    &profile,
                    get_head,
                    get_ranges,
                    get_events,
                    Some(post_events),
                    Some(persist_events),
                )
                .await?;
            errors.append(&mut result);
        }

        let mut request_futures = vec![];
        for (event_key, _lww) in opinions {
            let request = self.fetch_event(&current_system_protobuf, event_key, get_events);
            request_futures.push(request);
        }

        let mut events_to_persist = vec![];

        for future in request_futures {
            let result = match future.await {
                Ok(result) => result,
                Err(_err) => continue,
            };

            if let Some(event) = result {
                events_to_persist.push(event);
            }
        }

        Self::persist_events_list(events_to_persist, persist_events).await?;

        PolycentricWasm::js_result_and_errors(&JsValue::NULL, errors)
    }

    /// Helper method to synchronize events for a particular system
    async fn sync_events_for_target_system(
        &self,
        current_system_protobuf: &PublicKey,
        target_system_protobuf: &PublicKey,
        get_head: &js_sys::Function,
        get_ranges: &js_sys::Function,
        get_events: &js_sys::Function,
        post_events: Option<&js_sys::Function>,
        persist_events: Option<&js_sys::Function>,
    ) -> std::result::Result<Vec<PlatformError>, JsValue> {
        let servers;
        {
            let engine = self.get_engine_ref()?;

            servers = engine
                .query_servers_for_system(&SystemKey::from_public_key(&current_system_protobuf))
                .map_err(|e| {
                    PlatformError::QueryError(format!("Unable to query servers: {:?}", e))
                })?;
        }

        let mut request_futures: Vec<_> = vec![];
        for server in servers {
            let request_future = self.sync_events_with_server(
                server.clone(),
                target_system_protobuf,
                get_head,
                get_ranges,
                get_events,
                post_events,
            );
            request_futures.push((server, request_future));
        }

        let mut errors: Vec<PlatformError> = vec![];
        let mut events_to_persist: Vec<SignedEvent> = vec![];
        for future in request_futures {
            let server = future.0;

            let events_result = future.1.await.map_err(|e| PlatformError::ServerError {
                server: server.clone(),
                error: format!("unable to sync events with server: {:?}", e),
            });

            let events = match events_result {
                Err(err) => {
                    errors.push(err.into());
                    continue;
                }
                Ok(res) => res,
            };

            for signed_event in events {
                let mut engine = self.get_engine_mut()?;

                let event_result = Event::from_bytes(&signed_event.event[..]).map_err(|e| {
                    PlatformError::ServerError {
                        server: server.clone(),
                        error: format!("Unable to deserialize event: {:?}", e),
                    }
                });

                let event = match event_result {
                    Ok(evt) => evt,
                    Err(err) => {
                        errors.push(err.into());
                        continue;
                    }
                };

                let proc = match event.process {
                    Some(proc) => proc,
                    None => {
                        errors.push(
                            PlatformError::ServerError {
                                server: server.clone(),
                                error: "Deserialized event has no process ID".to_string(),
                            }
                            .into(),
                        );
                        continue;
                    }
                };

                let stored_event = engine.event_store.get_event_raw(&EventKey {
                    system_key_type: target_system_protobuf.key_type,
                    system_key: target_system_protobuf.key.clone(),
                    process: proc.process,
                    logical_clock: event.logical_clock,
                });

                if stored_event.is_none() {
                    let ingest_result = engine.ingest_event(signed_event.clone()).map_err(|e| {
                        PlatformError::ServerError {
                            server: server.clone(),
                            error: format!("Unable to ingest event: {:?}", e),
                        }
                    });

                    if let Err(err) = ingest_result {
                        errors.push(err);
                    } else {
                        events_to_persist.push(signed_event);
                    }
                }
            }
        }

        if let Some(persist_events) = persist_events {
            Self::persist_events_list(events_to_persist, persist_events).await?;
        }

        Ok(errors)
    }

    async fn persist_events_list(
        events_to_persist: Vec<SignedEvent>,
        persist_events: &js_sys::Function,
    ) -> Result<(), JsValue> {
        let events_to_persist_protobuf = Events {
            events: events_to_persist,
        };

        let persist_promise = persist_events
            .call1(
                &JsValue::NULL,
                &Uint8Array::from(&events_to_persist_protobuf.encode_to_vec()[..]),
            )
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to persist events: {:?}", e))
            })?;

        JsFuture::from(js_sys::Promise::from(persist_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to await persists event: {:?}", e))
            })?;

        Ok(())
    }

    async fn sync_events_with_server(
        &self,
        server: String,
        system_protobuf: &PublicKey,
        get_head: &js_sys::Function,
        get_ranges: &js_sys::Function,
        get_events: &js_sys::Function,
        post_events: Option<&js_sys::Function>,
    ) -> std::result::Result<Vec<SignedEvent>, JsValue> {
        let system = system_protobuf.to_bytes().map_err(|e| {
            PlatformError::SerializationError(format!(
                "Unable to serialize provided system public key: {:?}",
                e
            ))
        })?;

        let server_js = &JsValue::from_str(&server);
        let system_js = &Uint8Array::from(&system[..]);

        let head_promise = get_head
            .call2(&JsValue::NULL, server_js, system_js)
            .map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query head endpoint: {:?}", e))
            })?;
        let ranges_promise = get_ranges
            .call2(&JsValue::NULL, server_js, system_js)
            .map_err(|e| {
                PlatformError::CallbackError(format!(
                    "Unable to query get ranges endpoint: {:?}",
                    e
                ))
            })?;

        let head_value = JsFuture::from(js_sys::Promise::from(head_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query head endpoint: {:?}", e))
            })?;
        let head_bytes = head_value
            .dyn_into::<Uint8Array>()
            .map_err(|_| {
                PlatformError::CallbackError("Expected Uint8Array from head callback".to_string())
            })?
            .to_vec();
        let head_protobuf = Events::from_bytes(&head_bytes).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize head endpoint response: {:?}",
                e
            ))
        })?;

        let ranges_value = JsFuture::from(js_sys::Promise::from(ranges_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!(
                    "Unable to query get ranges endpoint: {:?}",
                    e
                ))
            })?;
        let ranges_bytes = ranges_value
            .dyn_into::<Uint8Array>()
            .map_err(|_| {
                PlatformError::CallbackError("Expected Uint8Array from ranges callback".to_string())
            })?
            .to_vec();
        let ranges_protobuf = RangesForSystem::decode(&ranges_bytes[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize ranges endpoint response: {:?}",
                e
            ))
        })?;

        let requests;
        {
            let engine = self.get_engine_ref()?;
            requests =
                prepare_sync_requests(&engine, &system_protobuf, &head_protobuf, &ranges_protobuf)
                    .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;
        }

        let get_promise = get_events
            .call3(
                &JsValue::NULL,
                server_js,
                system_js,
                &Uint8Array::from(&requests.ranges_to_get.encode_to_vec()[..]),
            )
            .map_err(|e| {
                PlatformError::CallbackError(format!(
                    "Unable to query get events endpoint: {:?}",
                    e
                ))
            })?;
        let get_future = JsFuture::from(js_sys::Promise::from(get_promise));

        if let Some(post_events) = post_events {
            let post_promise = post_events
                .call2(
                    &JsValue::NULL,
                    server_js,
                    &Uint8Array::from(&requests.events_to_post.encode_to_vec()[..]),
                )
                .map_err(|e| {
                    PlatformError::CallbackError(format!(
                        "Unable to query post events endpoint: {:?}",
                        e
                    ))
                })?;
            let post_future = JsFuture::from(js_sys::Promise::from(post_promise));
            post_future.await.map_err(|e| {
                PlatformError::CallbackError(format!(
                    "Unable to sync events from the client to the server: {:?}",
                    e
                ))
            })?;
        }

        let get_response_value = get_future.await.map_err(|e| {
            PlatformError::CallbackError(format!(
                "Unable to sync events from the server to the client: {:?}",
                e
            ))
        })?;

        let get_response_bytes = get_response_value
            .dyn_into::<Uint8Array>()
            .map_err(|_| {
                PlatformError::CallbackError(
                    "Expected Uint8Array from get_events callback".to_string(),
                )
            })?
            .to_vec();
        let get_response_protobuf = Events::from_bytes(&get_response_bytes).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize get endpoint response: {:?}",
                e
            ))
        })?;

        Ok(get_response_protobuf.events)
    }

    /// Helper method to fetch a particular event
    async fn fetch_event(
        &self,
        current_system_protobuf: &PublicKey,
        event_key: EventKey,
        get_events: &js_sys::Function,
    ) -> std::result::Result<Option<SignedEvent>, JsValue> {
        let servers;
        {
            let engine = self.get_engine_ref()?;

            if let Some(event) = engine.event_store.get_event_raw(&event_key) {
                return Ok(Some(event.to_owned()));
            }

            servers = engine
                .query_servers_for_system(&SystemKey::from_public_key(&current_system_protobuf))
                .map_err(|e| {
                    PlatformError::QueryError(format!("Unable to query servers: {:?}", e))
                })?;
        }

        for server in servers {
            let result = match self
                .fetch_event_from_server(server, &event_key, get_events)
                .await
            {
                Ok(result) => result,
                Err(_err) => continue,
            };

            match result {
                Some(event) => return Ok(Some(event)),
                None => continue,
            }
        }

        Ok(None)
    }

    async fn fetch_event_from_server(
        &self,
        server: String,
        event_key: &EventKey,
        get_events: &js_sys::Function,
    ) -> std::result::Result<Option<SignedEvent>, JsValue> {
        let request = fetch_event_request(event_key);
        let request_bytes = request.encode_to_vec();

        let system = PublicKey {
            key_type: event_key.system_key_type,
            key: event_key.system_key.clone(),
        };

        let system_bytes = system.to_bytes().map_err(|e| {
            PlatformError::SerializationError(format!("Unable to serialize public key: {:?}", e))
        })?;

        let get_promise = get_events
            .call3(
                &JsValue::NULL,
                &JsValue::from_str(&server),
                &Uint8Array::from(&system_bytes[..]),
                &Uint8Array::from(&request_bytes[..]),
            )
            .map_err(|e| {
                PlatformError::CallbackError(format!(
                    "Unable to query get events endpoint: {:?}",
                    e
                ))
            })?;
        let get_future = JsFuture::from(js_sys::Promise::from(get_promise));

        let get_response_value = get_future.await.map_err(|e| {
            PlatformError::CallbackError(format!(
                "Unable to sync events from the server to the client: {:?}",
                e
            ))
        })?;

        let get_response_bytes = get_response_value
            .dyn_into::<Uint8Array>()
            .map_err(|_| {
                PlatformError::CallbackError(
                    "Expected Uint8Array from get_events callback".to_string(),
                )
            })?
            .to_vec();
        let get_response_protobuf = Events::from_bytes(&get_response_bytes).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize get endpoint response: {:?}",
                e
            ))
        })?;

        let signed_event = match get_response_protobuf.events.get(0) {
            Some(evt) => evt.to_owned(),
            None => return Ok(None),
        };

        signed_event.verify_signature().map_err(|e| {
            PlatformError::DeserializationError(format!("Event signature invalid: {:?}", e))
        })?;

        let event = Event::from_bytes(&signed_event.event[..])
            .map_err(|e| PlatformError::DeserializationError(format!("Invalid event: {:?}", e)))?;

        let returned_event_key = EventKey::from_event(&event).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to derive event key from event: {:?}",
                e
            ))
        })?;

        if returned_event_key != *event_key {
            return Ok(None);
        }

        self.ingest_event(&signed_event.encode_to_vec()[..])?;

        return Ok(Some(signed_event));
    }

    /// Create an event.
    ///
    /// # Arguments
    /// * `event_creation_data` - Serialized EventCreationData protobuf bytes
    /// * `sign_event` - Callback function to sign an event
    /// * `persist_event` - Callback function to persist an event
    /// * `get_next_logical_clock` - Callback function to get next logical clock
    /// * `persist_logical_clock` - Callback function to persist next logical clock
    ///
    /// # Returns
    /// * `Result<SignedEvent>` - Serialized SignedEvent protobuf bytes or error
    #[wasm_bindgen]
    pub async fn create_event(
        &self,
        event_creation_data: &[u8],
        sign_event: &js_sys::Function,
        persist_event: &js_sys::Function,
        get_next_logical_clock: &js_sys::Function,
        persist_logical_clock: &js_sys::Function,
    ) -> std::result::Result<Uint8Array, JsValue> {
        let event_creation_data = EventCreationData::decode(event_creation_data).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Failed to decode event creation data: {}",
                e
            ))
        })?;

        let system = event_creation_data.system.ok_or_else(|| {
            PlatformError::InvalidEventCreationData(
                "Event missing required data: System".to_string(),
            )
        })?;
        let process = event_creation_data.process.ok_or_else(|| {
            PlatformError::InvalidEventCreationData(
                "Event missing required data: Process".to_string(),
            )
        })?;
        let content_type = ContentType::try_from(event_creation_data.content_type)
            .map_err(|_| PlatformError::DeserializationError("Invalid content type".into()))?;

        // Get logical clock (either provided or from callback)
        let logical_clock = if let Some(clock) = event_creation_data.logical_clock {
            clock
        } else {
            Self::get_logical_clock(get_next_logical_clock, persist_logical_clock).await?
        };

        let vector_clock;
        {
            let service = self.get_engine_ref()?;
            vector_clock = service
                .compute_vector_clock(&system.encode_to_vec(), &process.process, &|_, _| {
                    Ok(logical_clock)
                })
                .unwrap_or_else(|_| VectorClock::empty());
        }

        let event = Event::new(
            system,
            process,
            logical_clock,
            content_type,
            event_creation_data.content.to_vec(),
            vector_clock,
            Indices::default(), // Rust core doesn't use these indicies. Maintained the same Event proto def for server compatability
            event_creation_data.lww_element_set,
            event_creation_data.lww_element,
            event_creation_data.references,
            Some(self.get_unix_epoch()),
        );

        let event_bytes = event.to_bytes().map_err(|e| {
            PlatformError::SerializationError(format!("Failed to encode event: {}", e))
        })?;

        let signed_event =
            Self::sign_and_persist_event(sign_event, persist_event, event_bytes).await?;

        self.ingest_event(&signed_event.to_vec())?;

        Ok(signed_event)
    }

    /// Ingest a signed event into the query engine.
    ///
    /// # Arguments
    /// * `signed_event` - Serialized SignedEvent protobuf bytes
    ///
    /// # Returns
    /// * `Result<u64, JsValue>` - The logical clock of the ingested event or error
    #[wasm_bindgen]
    pub fn ingest_event(&self, signed_event: &[u8]) -> std::result::Result<u64, JsValue> {
        let signed_event = SignedEvent::from_bytes(signed_event) // from_bytes will verify the signature, decode will not
            .map_err(|e| JsValue::from_str(&format!("Failed to decode signed event: {}", e)))?;

        let logical_clock = if let Ok(event) = Event::decode(signed_event.event.as_slice()) {
            event.logical_clock
        } else {
            return Err(JsValue::from_str(
                "Failed to decode event from signed event",
            ));
        };

        let mut engine = self.get_engine_mut()?;

        engine
            .ingest_event(signed_event)
            .map_err(|e| JsValue::from_str(&format!("Failed to ingest event: {}", e)))?;

        Ok(logical_clock)
    }

    /// Ingest multiple signed events into the query engine.
    ///
    /// # Arguments
    /// * `events` - Serialized Events protobuf bytes
    ///
    /// # Returns
    /// * `Result<(), JsValue>` - Success or error
    #[wasm_bindgen]
    pub fn ingest_events(&self, events: &[u8]) -> std::result::Result<(), JsValue> {
        let events = Events::from_bytes(events)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode events: {}", e)))?;

        let mut engine = self.get_engine_mut()?;

        for signed_event in events.events {
            signed_event
                .verify_signature()
                .map_err(|e| JsValue::from_str(&format!("Event signature invalid: {}", e)))?;

            engine
                .ingest_event(signed_event)
                .map_err(|e| JsValue::from_str(&format!("Failed to ingest event: {}", e)))?;
        }

        Ok(())
    }

    /// Helper function to get logical clock
    async fn get_logical_clock(
        get_next_logical_clock: &js_sys::Function,
        persist_logical_clock: &js_sys::Function,
    ) -> Result<u64, JsValue> {
        let clock_promise = get_next_logical_clock.call0(&JsValue::NULL).map_err(|e| {
            PlatformError::CallbackError(format!("Failed to get next logical clock: {:?}", e))
        })?;

        let clock_value = JsFuture::from(js_sys::Promise::from(clock_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to await logical clock: {:?}", e))
            })?;

        let bigint = clock_value.dyn_into::<BigInt>().map_err(|e| {
            PlatformError::CallbackError(format!("Failed to convert to BigInt: {:?}", e))
        })?;

        let clock_str = bigint.to_string(10).map_err(|e| {
            PlatformError::CallbackError(format!("Failed to convert BigInt to string: {:?}", e))
        })?;

        let clock = clock_str
            .as_string()
            .ok_or_else(|| {
                PlatformError::CallbackError("Failed to get string from JsString".to_string())
            })?
            .parse::<u64>()
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to parse logical clock: {:?}", e))
            })?;

        let persist_promise = persist_logical_clock
            .call1(&JsValue::NULL, &BigInt::from(clock))
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to persist logical clock: {:?}", e))
            })?;

        JsFuture::from(js_sys::Promise::from(persist_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!(
                    "Failed to await persist logical clock: {:?}",
                    e
                ))
            })?;

        Ok(clock)
    }

    /// Helper function to sign and persist event
    async fn sign_and_persist_event(
        sign_event: &js_sys::Function,
        persist_event: &js_sys::Function,
        event_bytes: Vec<u8>,
    ) -> Result<Uint8Array, JsValue> {
        let sign_promise = sign_event
            .call1(&JsValue::NULL, &Uint8Array::from(&event_bytes[..]))
            .map_err(|e| PlatformError::CallbackError(format!("Failed to sign event: {:?}", e)))?;

        let signed_event_bytes = JsFuture::from(js_sys::Promise::from(sign_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to await signed event: {:?}", e))
            })?;

        let signed_event_vec = signed_event_bytes
            .dyn_into::<Uint8Array>()
            .map_err(|_| {
                PlatformError::CallbackError(
                    "Expected Uint8Array from sign_event callback".to_string(),
                )
            })?
            .to_vec();

        let _ = SignedEvent::from_bytes(&signed_event_vec[..])
            .map_err(|e| PlatformError::CryptoError(format!("Event signature invalid: {:?}", e)))?; // Verify the generated signature

        Self::persist_event(persist_event, &signed_event_vec[..]).await?;

        Ok(js_sys::Uint8Array::from(&signed_event_vec[..]))
    }

    async fn persist_event(
        persist_event: &js_sys::Function,
        signed_event_bytes: &[u8],
    ) -> Result<(), JsValue> {
        let persist_promise = persist_event
            .call1(
                &JsValue::NULL,
                &js_sys::Uint8Array::from(signed_event_bytes),
            )
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to persist event: {:?}", e))
            })?;

        JsFuture::from(js_sys::Promise::from(persist_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Failed to await persist event: {:?}", e))
            })?;

        Ok(())
    }

    /// Helper function to query a feed for all servers for a given system, and then deduplicate the results
    async fn query_feed_for_all_servers(
        &self,
        system: &[u8],
        query_callback: impl AsyncFn(
            String,
            Option<Uint8Array>,
        ) -> Result<ResultEventsAndRelatedEventsAndCursor, JsValue>,
        cursors: &js_sys::Map,
        per_server_limit: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;
        let servers;
        {
            let engine = self.get_engine_ref()?;
            servers = engine
                .query_servers_for_system(&SystemKey::from_public_key(&system_protobuf))
                .map_err(|e| {
                    PlatformError::QueryError(format!("Unable to query servers: {:?}", e))
                })?;
        }

        let mut query_futures = vec![];
        for server in servers {
            let server_js_value = JsValue::from(server.clone());
            let cursor_js_value = cursors.get(&server_js_value);

            let cursor = if cursor_js_value.is_truthy() {
                match cursor_js_value.dyn_into::<Uint8Array>() {
                    Ok(arr) => Some(arr),
                    Err(_) => None,
                }
            } else if cursor_js_value.is_null() {
                continue;
            } else {
                None
            };

            let query_future = query_callback(server.clone(), cursor);
            query_futures.push((server.clone(), query_future));
        }

        let mut server_feeds: Vec<Vec<SignedEvent>> = vec![];
        let mut errors: Vec<PlatformError> = vec![];
        for (server, query_future) in query_futures {
            let response_result = query_future.await;

            let response = match response_result.map_err(|e| PlatformError::ServerError {
                server: server.clone(),
                error: format!("{:?}", e),
            }) {
                Ok(resp) => resp,
                Err(err) => {
                    errors.push(err);
                    continue;
                }
            };

            let result_events = match response.result_events {
                Some(evts) => evts.events,
                None => vec![],
            };

            server_feeds.push(result_events);

            let server_js_value = JsValue::from(server.clone());
            if let Some(cursor) = response.cursor {
                cursors.set(
                    &server_js_value,
                    &JsValue::from(Uint8Array::from(&cursor[..])),
                );
            } else {
                // If the server doesn't return a cursor, don't keep querying it for events
                cursors.set(&server_js_value, &JsValue::NULL);
            }
        }

        let events_unfiltered = feed_helpers::deduplicate_events(
            feed_helpers::combine_server_feeds(server_feeds, per_server_limit),
        )
        .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;

        let events = self
            .get_engine_ref()?
            .filter_feed(
                &SystemKey::from_public_key(&system_protobuf),
                &events_unfiltered,
            )
            .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;

        let events_protobuf = Events { events };

        let events_bytes = Events::to_bytes(&events_protobuf).map_err(|e| {
            PlatformError::SerializationError(format!("Unable to serialize events object: {:?}", e))
        })?;

        PolycentricWasm::js_result_and_errors(&Uint8Array::from(&events_bytes[..]).into(), errors)
    }

    /// Helper function which exists primarily to contain the boilerplate required to call an async js callback
    async fn query_endpoint_for_server(
        &self,
        endpoint_callback: &js_sys::Function,
        args: &Array,
    ) -> Result<ResultEventsAndRelatedEventsAndCursor, JsValue> {
        let request_promise =
            Reflect::apply(endpoint_callback, &JsValue::NULL, args).map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query endpoint: {:?}", e))
            })?;

        let result_js = JsFuture::from(js_sys::Promise::from(request_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query endpoint: {:?}", e))
            })?;
        let result_binary = result_js.dyn_into::<Uint8Array>().map_err(|_| {
            PlatformError::CallbackError("Expected Uint8Array from endpoint callback".to_string())
        })?;
        let result_protobuf = ResultEventsAndRelatedEventsAndCursor::decode(
            &result_binary.to_vec()[..],
        )
        .map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize endpoint response {:?}",
                e
            ))
        })?;

        let result_events = match result_protobuf.result_events.clone() {
            Some(events) => events.events,
            None => vec![],
        };

        let related_events = match result_protobuf.related_events.clone() {
            Some(events) => events.events,
            None => vec![],
        };

        for signed_event in related_events {
            let serialized_event = signed_event.to_bytes().map_err(|e| {
                PlatformError::SerializationError(format!(
                    "Unable to serialize event object {:?}",
                    e
                ))
            })?;

            self.ingest_event(&serialized_event[..])?;
        }

        for signed_event in result_events {
            signed_event.verify_signature().map_err(|e| {
                PlatformError::DeserializationError(format!("Event signature invalid: {:?}", e))
            })?;
        }

        Ok(result_protobuf)
    }

    /// Queries the explore feed for a given system
    ///
    /// # Arguments
    /// * `system` - The system whose explore feed should be queried (generally assumed to be a system associated with the current process)
    /// * `get_explore` - Callback function to query the explore endpoint of arbitrary servers
    /// * `cursors` - A map which associates servers with their current cursors. This map will be updated with new cursors, so an empty map should be passed on the first call
    /// * `per_server_limit` - The limit parameter to be passed to each server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to each server
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf Events object representing this feed
    #[wasm_bindgen]
    pub async fn query_explore_feed(
        &self,
        system: &[u8],
        get_explore: &js_sys::Function,
        cursors: &js_sys::Map,
        per_server_limit: Option<usize>,
        moderation_filters: Option<String>,
    ) -> Result<JsValue, JsValue> {
        self.query_feed_for_all_servers(
            system,
            |server, cursor| {
                self.query_explore_feed_specific_server_internal(
                    server,
                    get_explore,
                    cursor,
                    per_server_limit,
                    moderation_filters.clone(),
                )
            },
            cursors,
            per_server_limit,
        )
        .await
    }

    // Helper method to query the explore feed of a particular server
    async fn query_explore_feed_specific_server_internal(
        &self,
        server: String,
        get_explore: &js_sys::Function,
        cursor: Option<Uint8Array>,
        limit: Option<usize>,
        moderation_filters: Option<String>,
    ) -> Result<ResultEventsAndRelatedEventsAndCursor, JsValue> {
        let args = Array::new_with_length(4);
        // Note that the call to into here without using specific types could lead to weird bugs down the line
        // I think it's fine but if you run into type issues double check that the types that this is producing
        // Actually match the types you expect
        args.set(0, server.clone().into());
        args.set(1, cursor.into());
        args.set(2, limit.into());
        args.set(3, moderation_filters.into());

        self.query_endpoint_for_server(get_explore, &args).await
    }

    /// Queries the explore feed for a specific server.
    ///
    /// # Arguments
    /// * `server` - The server whose explore feed should be queried
    /// * `get_explore` - Callback function to query the explore endpoint of arbitrary servers
    /// * `cursor` - The cursor to use (if one is available)
    /// * `per_server_limit` - The limit parameter to be passed to the server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to the server
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf ResultEventsAndRelatedEventsAndCursor object representing this feed
    #[wasm_bindgen]
    pub async fn query_explore_feed_specific_server(
        &self,
        server: String,
        get_explore: &js_sys::Function,
        cursor: Option<Uint8Array>,
        limit: Option<usize>,
        moderation_filters: Option<String>,
    ) -> Result<Uint8Array, JsValue> {
        let result = self
            .query_explore_feed_specific_server_internal(
                server,
                get_explore,
                cursor,
                limit,
                moderation_filters,
            )
            .await?;

        let result_bytes = result.encode_to_vec();
        Ok(Uint8Array::from(&result_bytes[..]))
    }

    /// Queries the search endpoint for all servers for a given system
    ///
    /// # Arguments
    /// * `system` - The system whose servers should be queried (generally assumed to be a system associated with the current process)
    /// * `get_search` - Callback function to query the search endpoint of arbitrary servers
    /// * `cursors` - A map which associates servers with their current cursors. This map will be updated with new cursors, so an empty map should be passed on the first call
    /// * `per_server_limit` - The limit parameter to be passed to each server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to each server
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf Events object representing this feed
    #[wasm_bindgen]
    pub async fn query_search(
        &self,
        system: &[u8],
        get_search: &js_sys::Function,
        search_query: String,
        search_type: Option<String>,
        cursors: &js_sys::Map,
        per_server_limit: Option<usize>,
        moderation_filters: Option<String>,
    ) -> Result<JsValue, JsValue> {
        self.query_feed_for_all_servers(
            system,
            |server, cursor| {
                self.query_search_specific_server_internal(
                    server,
                    get_search,
                    search_query.clone(),
                    search_type.clone(),
                    cursor,
                    per_server_limit,
                    moderation_filters.clone(),
                )
            },
            cursors,
            per_server_limit,
        )
        .await
    }

    // Helper method to query the search endpoint of a particular server
    async fn query_search_specific_server_internal(
        &self,
        server: String,
        get_search: &js_sys::Function,
        search_query: String,
        search_type: Option<String>,
        cursor: Option<Uint8Array>,
        limit: Option<usize>,
        moderation_filters: Option<String>,
    ) -> Result<ResultEventsAndRelatedEventsAndCursor, JsValue> {
        let args = Array::new_with_length(6);
        // Note that the call to into here without using specific types could lead to weird bugs down the line
        // I think it's fine but if you run into type issues double check that the types that this is producing
        // Actually match the types you expect
        args.set(0, server.clone().into());
        args.set(1, search_query.clone().into());
        args.set(2, search_type.clone().into());
        args.set(3, cursor.into());
        args.set(4, limit.into());
        args.set(5, moderation_filters.into());

        self.query_endpoint_for_server(get_search, &args).await
    }

    /// Queries the search endpoint for a specific server.
    ///
    /// # Arguments
    /// * `server` - The server whose explore feed should be queried
    /// * `get_search` - Callback function to query the search endpoint of arbitrary servers
    /// * `cursor` - The cursor to use (if one is available)
    /// * `per_server_limit` - The limit parameter to be passed to the server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to the server
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf ResultEventsAndRelatedEventsAndCursor object representing this feed
    #[wasm_bindgen]
    pub async fn query_search_specific_server(
        &self,
        server: String,
        get_search: &js_sys::Function,
        search_query: String,
        search_type: Option<String>,
        cursor: Option<Uint8Array>,
        limit: Option<usize>,
        moderation_filters: Option<String>,
    ) -> Result<Uint8Array, JsValue> {
        let result = self
            .query_search_specific_server_internal(
                server,
                get_search,
                search_query,
                search_type,
                cursor,
                limit,
                moderation_filters,
            )
            .await?;

        let result_bytes = result.encode_to_vec();
        Ok(Uint8Array::from(&result_bytes[..]))
    }

    /// Queries the feed of events authored by a specific system
    ///
    /// # Arguments
    /// * `system` - The system whose author feed should be queried
    /// * `get_head` - Callback function which queries the GET /head endpoint of the server to sync with. Accepts a protobuf PublicKey and returns an Events object.
    /// * `get_ranges` - Callback function which queries the GET /ranges endpoint. Accepts a PublicKey and returns a RangesForSystem object
    /// * `get_events` - Callback function which queries the GET /events endpoint. Accepts a PublicKey and a RangesForSystem and returns an Events object.
    #[wasm_bindgen]
    pub async fn query_author_feed(
        &self,
        current_system: &[u8],
        target_system: &[u8],
        limit: usize,
        latest_event: Option<Uint8Array>,
        get_head: &js_sys::Function,
        get_ranges: &js_sys::Function,
        get_events: &js_sys::Function,
    ) -> Result<Uint8Array, JsValue> {
        let current_system_protobuf = PublicKey::from_bytes(current_system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;

        let target_system_protobuf = PublicKey::from_bytes(target_system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;

        self.sync_events_for_target_system(
            &current_system_protobuf,
            &target_system_protobuf,
            get_head,
            get_ranges,
            get_events,
            None,
            None,
        )
        .await?;

        let system_key = SystemKey {
            key_type: target_system_protobuf.key_type,
            key: target_system_protobuf.key,
        };

        let latest = match latest_event {
            None => None,
            Some(evt) => {
                let event_bytes = &evt.to_vec()[..];
                let event = Event::from_bytes(event_bytes).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to deserialize provided event object: {:?}",
                        e
                    ))
                })?;

                Some(TimelineKey::from_event(&event).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to derive timeline key from provided event: {:?}",
                        e
                    ))
                })?)
            }
        };

        let engine = self.get_engine_ref()?;
        let feed = engine
            .query_author_feed(&system_key, limit, latest)
            .map_err(|e| {
                PlatformError::QueryError(format!("Unable to query author feed: {:?}", e))
            })?;

        let feed_protobuf = Events { events: feed };

        let feed_bytes = feed_protobuf.to_bytes().map_err(|e| {
            PlatformError::SerializationError(format!("Unable to serialize events object: {:?}", e))
        })?;

        Ok(Uint8Array::from(&feed_bytes[..]))
    }

    /// Queries the cached following feed for a specific system
    ///
    /// # Arguments
    /// * `system` - The system whose following feed should be queried
    /// * `limit` - The number of events that should be returned
    /// * `latest_event` - The event to begin reading the following feed from (used for pagination)
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf Events object representing this feed
    #[wasm_bindgen]
    pub fn query_following_feed(
        &self,
        system: &[u8],
        limit: usize,
        latest_event: Option<Uint8Array>,
    ) -> Result<Uint8Array, JsValue> {
        let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;

        let system_key = SystemKey {
            key_type: system_protobuf.key_type,
            key: system_protobuf.key,
        };

        let latest = match latest_event {
            None => None,
            Some(evt) => {
                let event_bytes = &evt.to_vec()[..];
                let event = Event::from_bytes(event_bytes).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to deserialize provided event object: {:?}",
                        e
                    ))
                })?;

                Some(TimelineKey::from_event(&event).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to derive timeline key from provided event: {:?}",
                        e
                    ))
                })?)
            }
        };

        let engine = self.get_engine_ref()?;
        let feed = engine
            .query_following_feed(&system_key, limit, latest)
            .map_err(|e| {
                PlatformError::QueryError(format!("Unable to query following feed: {:?}", e))
            })?;

        let feed_protobuf = Events { events: feed };

        let feed_bytes = feed_protobuf.to_bytes().map_err(|e| {
            PlatformError::SerializationError(format!("Unable to serialize events object: {:?}", e))
        })?;

        Ok(Uint8Array::from(&feed_bytes[..]))
    }

    /// Queries the feed of events with a particular reference
    ///
    /// # Arguments
    /// * `system` - The system whose author feed should be queried
    /// * `get_query_references` - Callback function which queries the GET /query_references endpoint of the server to sync with. Accepts a protobuf QueryReferencesRequest and returns a QueryReferencesResponse.
    /// * `request` - Protobuf serialized bytes for the Reference object
    /// * `cursors` - A map which associates servers with their current cursors. This map will be updated with new cursors, so an empty map should be passed on the first call
    /// * `per_server_limit` - The limit parameter to be passed to each server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to each server
    /// # Returns
    /// * `Result<JsValue, JsValue>` - The binary representation of the protobuf Events object representing this feed
    #[wasm_bindgen]
    pub async fn query_references_feed(
        &self,
        system: &[u8],
        get_query_references: &js_sys::Function,
        reference: &[u8],
        cursors: &js_sys::Map,
        moderation_filters: Option<String>,
    ) -> Result<JsValue, JsValue> {
        self.query_feed_for_all_servers(
            system,
            async |server, cursor| {
                let response = self
                    .query_references_specific_server_internal(
                        server,
                        get_query_references,
                        reference,
                        cursor,
                        moderation_filters.clone(),
                    )
                    .await?;

                let mut events = vec![];

                for item in response.items {
                    if let Some(signed_event) = item.event {
                        events.push(signed_event);
                    }
                }

                let result_events = Some(Events { events });

                let related_events = Some(Events {
                    events: response.related_events,
                });

                Ok(ResultEventsAndRelatedEventsAndCursor {
                    result_events,
                    related_events,
                    cursor: response.cursor,
                })
            },
            cursors,
            None,
        )
        .await
    }

    /// Helper method to query the query_references endpoint of a specific server
    async fn query_references_specific_server_internal(
        &self,
        server: String,
        get_query_references: &js_sys::Function,
        reference: &[u8],
        cursor: Option<Uint8Array>,
        moderation_filters: Option<String>,
    ) -> Result<QueryReferencesResponse, JsValue> {
        let reference_protobuf = Reference::from_bytes(reference).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize reference object: {:?}",
                e
            ))
        })?;

        let request = QueryReferencesRequest {
            reference: Some(reference_protobuf.clone()),
            cursor: match cursor {
                Some(arr) => Some(arr.to_vec()),
                None => None,
            },

            // This field appears to be neccessary in order to get a response from the server
            request_events: Some(QueryReferencesRequestEvents {
                from_type: None,
                count_lww_element_references: vec![],
                count_references: vec![],
            }),
            count_lww_element_references: vec![],
            count_references: vec![],
            extra_byte_references: vec![],
        };

        let request_bytes = request.encode_to_vec();

        let args = Array::new_with_length(3);

        // Note that the call to into here without using specific types could lead to weird bugs down the line
        // I think it's fine but if you run into type issues double check that the types that this is producing
        // Actually match the types you expect
        args.set(0, server.clone().into());
        args.set(1, request_bytes.to_vec().into());
        args.set(2, moderation_filters.into());

        let request_promise =
            Reflect::apply(get_query_references, &JsValue::NULL, &args).map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query endpoint: {:?}", e))
            })?;

        let result_js = JsFuture::from(js_sys::Promise::from(request_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query endpoint: {:?}", e))
            })?;
        let result_binary = result_js.dyn_into::<Uint8Array>().map_err(|_| {
            PlatformError::CallbackError("Expected Uint8Array from callback".to_string())
        })?;
        let result_protobuf = QueryReferencesResponse::decode(&result_binary.to_vec()[..])
            .map_err(|e| {
                PlatformError::DeserializationError(format!(
                    "Unable to deserialize endpoint response {:?}",
                    e
                ))
            })?;

        let result_items = result_protobuf.items.clone();
        let related_events = result_protobuf.related_events.clone();

        for signed_event in related_events {
            let serialized_event = signed_event.to_bytes().map_err(|e| {
                PlatformError::SerializationError(format!(
                    "Unable to serialize event object {:?}",
                    e
                ))
            })?;

            self.ingest_event(&serialized_event[..])?;
        }

        for item in result_items {
            if let Some(signed_event) = item.event {
                signed_event.verify_signature().map_err(|e| {
                    PlatformError::DeserializationError(format!("Event signature invalid: {:?}", e))
                })?;

                let event = Event::from_bytes(&signed_event.event).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to deserialize event object: {:?}",
                        e
                    ))
                })?;

                let references = event.references_of_type(reference_protobuf.reference_type);

                let mut found_reference = false;

                for reference in references {
                    if reference_protobuf.equals(reference) {
                        found_reference = true;
                        break;
                    }
                }

                if !found_reference {
                    return Err(PlatformError::QueryError(
                        "Event does not include required reference".to_string(),
                    )
                    .into());
                }
            }
        }

        Ok(result_protobuf)
    }

    /// Queries the references feed for a particular server
    ///
    /// # Arguments
    /// * `server` - The server whose references feed should be queried
    /// * `get_query_references` - Callback function which queries the GET /query_references endpoint of the server to sync with. Accepts a protobuf QueryReferencesRequest and returns a QueryReferencesResponse.
    /// * `request` - Protobuf serialized bytes for the QueryReferencesRequest object
    /// * `cursor` - The cursor to be used for pagination (if available)
    /// * `per_server_limit` - The limit parameter to be passed to each server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to each server
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf QueryReferencesResponse object
    pub async fn query_references_feed_specific_server(
        &self,
        server: String,
        get_query_references: &js_sys::Function,
        reference: &[u8],
        cursor: Option<Uint8Array>,
        moderation_filters: Option<String>,
    ) -> Result<Uint8Array, JsValue> {
        let result = self
            .query_references_specific_server_internal(
                server,
                get_query_references,
                reference,
                cursor,
                moderation_filters,
            )
            .await?;

        let result_bytes = result.encode_to_vec();
        Ok(Uint8Array::from(&result_bytes[..]))
    }

    /// Queries the feed of comments on the user's posts
    ///
    /// # Arguments
    /// * `system` - The system whose author feed should be queried
    /// * `get_query_references` - Callback function which queries the GET /query_references endpoint of the server to sync with. Accepts a protobuf QueryReferencesRequest and returns a QueryReferencesResponse.
    /// * `request` - Protobuf serialized bytes for the QueryReferencesRequest object
    /// * `feed_state` - javascript CommentsFeedState object, used for pagination
    /// * `per_server_limit` - The limit parameter to be passed to each server
    /// * `moderation_filters` - The JSON moderation filters parameter to be passed to each server
    /// # Returns
    /// * `Result<JsValue, JsValue>` - The binary representation of the protobuf Events object representing this feed
    #[wasm_bindgen]
    pub async fn query_comments_feed(
        &self,
        system: &[u8],
        get_query_references: &js_sys::Function,
        feed_state: &js_sys::Object,
        moderation_filters: Option<String>,
    ) -> Result<JsValue, JsValue> {
        let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;

        let mut event_js = Reflect::get(feed_state, &JsValue::from("event"))
            .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

        if event_js.is_falsy() {
            let engine = self.get_engine_ref()?;
            let latest = engine
                .query_next_event_for_system(&SystemKey::from_public_key(&system_protobuf), None)
                .map_err(|e| {
                    PlatformError::QueryError(format!(
                        "Unable to query latest event for system: {:?}",
                        e
                    ))
                })?;

            if let Some(latest_event) = latest {
                let latest_event_bytes = latest_event.to_bytes().map_err(|e| {
                    PlatformError::SerializationError(format!("Unable to serialize event: {:?}", e))
                })?;

                let latest_event_js = Uint8Array::from(&latest_event_bytes[..]);

                Reflect::set(
                    feed_state,
                    &JsValue::from("event"),
                    &JsValue::from(latest_event_js.clone()),
                )
                .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

                event_js = JsValue::from(latest_event_js);
            }
        }

        let mut cursors_js = Reflect::get(feed_state, &JsValue::from("cursors"))
            .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

        if cursors_js.is_falsy() {
            Reflect::set(feed_state, &JsValue::from("cursors"), &js_sys::Map::new())
                .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;
            cursors_js = Reflect::get(feed_state, &JsValue::from("cursors"))
                .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;
        }

        let event_uint8_array = event_js.dyn_into::<Uint8Array>().map_err(|_| {
            PlatformError::CallbackError("Expected Uint8Array for event in feed_state".to_string())
        })?;
        let event_vec = event_uint8_array.to_vec();
        let event_protobuf = SignedEvent::from_bytes(&event_vec).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided event object: {:?}",
                e
            ))
        })?;

        let pointer = self.get_pointer(&event_protobuf.event).map_err(|e| {
            PlatformError::QueryError(format!("Unable to query pointer to event: {:?}", e))
        })?;

        let reference = Reference {
            reference_type: ReferenceType::Pointer as u64,
            reference: pointer.to_vec(),
        };

        let reference_bytes = reference.to_bytes().map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to serialize reference object: {:?}",
                e
            ))
        })?;

        let result_and_errors = self
            .query_references_feed(
                system,
                get_query_references,
                &reference_bytes[..],
                &js_sys::Map::from(cursors_js),
                moderation_filters,
            )
            .await?;

        let result = Reflect::get(&result_and_errors, &JsValue::from("result"))
            .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

        let result_uint8_array = result.clone().dyn_into::<Uint8Array>().map_err(|_| {
            PlatformError::CallbackError(
                "Expected Uint8Array for result in query response".to_string(),
            )
        })?;
        let result_protobuf =
            Events::from_bytes(&result_uint8_array.to_vec()[..]).map_err(|e| {
                PlatformError::DeserializationError(format!(
                    "Unable to deserialize provided events object: {:?}",
                    e
                ))
            })?;

        if result_protobuf.events.len() == 0 {
            let current_event = Event::from_bytes(&event_protobuf.event).map_err(|e| {
                PlatformError::DeserializationError(format!(
                    "Unable to deserialize event object: {:?}",
                    e
                ))
            })?;

            Reflect::set(feed_state, &JsValue::from("cursors"), &js_sys::Map::new())
                .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;

            let current_event_key = TimelineKey::from_event(&current_event).map_err(|e| {
                PlatformError::QueryError(format!(
                    "Unable to derive timeline key from event: {:?}",
                    e
                ))
            })?;

            let engine = self.get_engine_ref()?;
            let latest = engine
                .query_next_event_for_system(
                    &SystemKey::from_public_key(&system_protobuf),
                    Some(current_event_key),
                )
                .map_err(|e| {
                    PlatformError::QueryError(format!(
                        "Unable to query latest event for system: {:?}",
                        e
                    ))
                })?;

            if let Some(next) = latest {
                let next_bytes = next.to_bytes().map_err(|e| {
                    PlatformError::SerializationError(format!("Unable to serialize event: {:?}", e))
                })?;

                Reflect::set(
                    feed_state,
                    &JsValue::from("event"),
                    &JsValue::from(Uint8Array::from(&next_bytes[..])),
                )
                .map_err(|e| PlatformError::Unknown(format!("Reflection error: {:?}", e)))?;
            }
        }

        Ok(result_and_errors)
    }

    /// Queries the cached likes feed for a specific system
    ///
    /// # Arguments
    /// * `system` - The system whose likes feed should be queried
    /// * `limit` - The number of events that should be returned
    /// * `latest_event` - The event to begin reading the following feed from (used for pagination)
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - The binary representation of the protobuf Events object representing this feed
    #[wasm_bindgen]
    pub fn query_likes_feed(
        &self,
        system: &[u8],
        limit: usize,
        latest_event: Option<Uint8Array>,
    ) -> Result<Uint8Array, JsValue> {
        let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided system public key: {:?}",
                e
            ))
        })?;

        let system_key = SystemKey {
            key_type: system_protobuf.key_type,
            key: system_protobuf.key,
        };

        let latest = match latest_event {
            None => None,
            Some(evt) => {
                let event_bytes = &evt.to_vec()[..];
                let event = Event::from_bytes(event_bytes).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to deserialize provided event object: {:?}",
                        e
                    ))
                })?;

                Some(TimelineKey::from_event(&event).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to derive timeline key from provided event: {:?}",
                        e
                    ))
                })?)
            }
        };

        let engine = self.get_engine_ref()?;
        let feed = engine
            .query_likes_feed(&system_key, limit, latest)
            .map_err(|e| {
                PlatformError::QueryError(format!("Unable to query likes feed: {:?}", e))
            })?;

        let feed_protobuf = Events { events: feed };

        let feed_bytes = feed_protobuf.to_bytes().map_err(|e| {
            PlatformError::SerializationError(format!("Unable to serialize events object: {:?}", e))
        })?;

        Ok(Uint8Array::from(&feed_bytes[..]))
    }

    /// Get a reference (EventKey) from a Pointer.
    ///
    /// # Arguments
    /// * `pointer_bytes` - Serialized Pointer protobuf bytes
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - Serialized EventKey protobuf bytes or null if not found
    #[wasm_bindgen]
    pub fn get_reference(&self, pointer_bytes: &[u8]) -> Result<Option<Uint8Array>, JsValue> {
        let pointer = Pointer::decode(pointer_bytes)
            .map_err(|e| JsError::new(&format!("Failed to decode pointer: {}", e)))?;
        let engine = self.get_engine_ref()?;

        match engine.get_reference(&pointer) {
            Ok(Some(event_key)) => {
                let proto = ProtobufEventKey {
                    system_key_type: event_key.system_key_type,
                    system_key: event_key.system_key,
                    process: event_key.process,
                    logical_clock: event_key.logical_clock,
                };
                Ok(Some(Uint8Array::from(proto.encode_to_vec().as_slice())))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(JsError::new(&format!("get_reference failed: {}", e)).into()),
        }
    }

    /// Get a Pointer to the given Event
    ///
    /// # Arguments
    /// * `event_bytes` - Serialized Event protobuf bytes
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - Serialized Pointer protobuf bytes
    #[wasm_bindgen]
    pub fn get_pointer(
        &self, // Keep this as an instance method to ensure that it can't be called before the WASM core is properly loaded
        event_bytes: &[u8],
    ) -> Result<Uint8Array, JsValue> {
        let event = Event::decode(event_bytes)
            .map_err(|e| JsError::new(&format!("Failed to decode event: {}", e)))?;

        let pointer_bytes = Pointer {
            system: event.system,
            process: event.process,
            logical_clock: event.logical_clock,
            event_digest: Some(Digest::compute(event_bytes)),
        }
        .to_bytes()
        .map_err(|e| {
            PlatformError::SerializationError(format!("Unable to serialize pointer object {:?}", e))
        })?;

        Ok(Uint8Array::from(&pointer_bytes[..]))
    }

    /// Query all events for a given system, process, and logical clock range.
    ///
    /// # Arguments
    /// * `system_bytes` - Serialized system key bytes
    /// * `process_bytes` - Process bytes
    /// * `start_clock` - Start logical clock (inclusive)
    /// * `end_clock` - End logical clock (inclusive)
    ///
    /// # Returns
    /// * `Result<Vec<u8>, JsValue>` - Serialized events as a byte array
    #[wasm_bindgen]
    pub fn query_events(
        &self,
        system_bytes: &[u8],
        process_bytes: &[u8],
        start_clock: u64,
        end_clock: u64,
    ) -> Result<Vec<u8>, JsValue> {
        let engine = self.get_engine_ref()?;
        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;
        let process_id = ProcessId::from_process(&Process {
            process: process_bytes.to_vec(),
        });
        let query = EventRangeQuery {
            system: system_key,
            process: process_id,
            start_clock,
            end_clock,
        };
        let result = engine
            .query_events(query)
            .map_err(|e| JsError::new(&format!("Query events failed: {}", e)))?;
        Ok(polycentric_common::models::event_array::serialize_signed_events(&result.events))
    }

    /// Helper method to query a system-specific CRDT without making any network requests
    fn query_cached_crdt_for_system(
        &self,
        system_bytes: &[u8],
        content_type: u64,
    ) -> Result<Option<Uint8Array>, JsValue> {
        let engine = self.get_engine_ref()?;

        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;

        let content_type_enum =
            polycentric_common::models::protos::ContentType::try_from(content_type as i32)
                .map_err(|_| JsError::new(&format!("Invalid content type: {}", content_type)))?;

        match engine.query_crdt_for_system(&system_key, content_type_enum) {
            Ok(Some(lww_element)) => {
                let bytes = lww_element
                    .to_bytes()
                    .map_err(|e| JsError::new(&format!("Failed to serialize LwwElement: {}", e)))?;
                Ok(Some(Uint8Array::from(&bytes[..])))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(JsError::new(&format!("Query CRDT for system failed: {}", e)).into()),
        }
    }

    /// Helper method to query a system-specific CRDT from a specific server
    async fn query_server_crdt_for_system(
        &self,
        system_bytes: &[u8],
        content_type: u64,
        server: String,
        query_latest: &js_sys::Function,
    ) -> Result<Events, JsValue> {
        let content_types_binary = RepeatedUInt64::encode_to_vec(&RepeatedUInt64 {
            numbers: vec![content_type],
        });

        let request_promise = query_latest
            .call3(
                &JsValue::NULL,
                &js_sys::JsString::from(server),
                &js_sys::Uint8Array::from(system_bytes),
                &Uint8Array::from(&content_types_binary[..]),
            )
            .map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query endpoint: {:?}", e))
            })?;

        let result_js = JsFuture::from(js_sys::Promise::from(request_promise))
            .await
            .map_err(|e| {
                PlatformError::CallbackError(format!("Unable to query endpoint: {:?}", e))
            })?;
        let result_binary = result_js.dyn_into::<Uint8Array>().map_err(|_| {
            PlatformError::CallbackError("Expected Uint8Array from callback".to_string())
        })?;
        let result_protobuf = Events::from_bytes(&result_binary.to_vec()[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize query_latest endpoint response: {:?}",
                e
            ))
        })?;

        Ok(result_protobuf)
    }

    /// Query system-specific CRDT value (username, description, avatar, etc.)
    ///
    /// # Arguments
    /// * `target_system_bytes` - Serialized system key bytes for the system whose CRDT to query
    /// * `content_type` - Content type as u64
    /// * `current_system_bytes` - Serialized system key bytes for the system whose servers to use
    /// * `get_query_latest` - Callback to query the GET /query_latest endpoint of a particular server
    ///
    /// # Returns
    /// * `Result<Option<Uint8Array>, JsValue>` - Serialized LwwElement protobuf bytes or null if not found
    #[wasm_bindgen]
    pub async fn query_crdt_for_system(
        &self,
        target_system_bytes: &[u8],
        content_type: u64,
        current_system_bytes: &[u8],
        get_query_latest: &js_sys::Function,
    ) -> Result<Option<Uint8Array>, JsValue> {
        if let Some(value) = self.query_cached_crdt_for_system(target_system_bytes, content_type)? {
            return Ok(Some(value)); // If we have a value cached, it's probably better to just use it rather than waiting for network requests
        }

        let _ = self
            .query_feed_for_all_servers(
                current_system_bytes,
                async |server, _| {
                    let events = self
                        .query_server_crdt_for_system(
                            target_system_bytes,
                            content_type,
                            server,
                            get_query_latest,
                        )
                        .await?;

                    // This might be a little cleaner if moved to the query_server_crdt method but that would be a bit less efficient
                    let mut engine = self.get_engine_mut()?;
                    for signed_event in &events.events {
                        engine
                            .ingest_event(signed_event.clone()) // Ingest the event and verify the signature
                            .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;
                    }

                    Ok(ResultEventsAndRelatedEventsAndCursor {
                        result_events: Some(events),
                        related_events: None,
                        cursor: None,
                    })
                },
                &js_sys::Map::new(),
                None,
            )
            .await?;

        self.query_cached_crdt_for_system(target_system_bytes, content_type)
    }

    /// Query the current opinion for a target event by the current user's system
    ///
    /// # Arguments
    /// * `current_system_bytes` - Serialized system key bytes for the current user
    /// * `target_pointer_bytes` - Serialized Pointer protobuf bytes for the target event
    ///
    /// # Returns
    /// * `Result<Option<Uint8Array>, JsValue>` - Serialized LwwElement protobuf bytes or null if no opinion found
    #[wasm_bindgen]
    pub fn query_opinion(
        &self,
        current_system_bytes: &[u8],
        target_pointer_bytes: &[u8],
    ) -> Result<Option<Uint8Array>, JsValue> {
        let engine = self.get_engine_ref()?;

        let current_system = engine
            .parse_system_key(current_system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse current system key: {}", e)))?;

        let target_pointer = Pointer::from_bytes(target_pointer_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse target pointer: {}", e)))?;

        match engine.query_opinion(&current_system, &target_pointer) {
            Ok(Some(lww_element)) => {
                let bytes = lww_element
                    .to_bytes()
                    .map_err(|e| JsError::new(&format!("Failed to serialize LwwElement: {}", e)))?;
                Ok(Some(Uint8Array::from(&bytes[..])))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(JsError::new(&format!("Query opinion failed: {}", e)).into()),
        }
    }

    /// Query whether a given event has been deleted
    ///
    /// # Arguments
    /// * `event_bytes` - Serialized event object
    ///
    /// # Returns
    /// * `Result<Boolean, JsValue>` - True if the event has been deleted, false otherwise
    #[wasm_bindgen]
    pub fn query_event_is_deleted(&self, pointer_bytes: &[u8]) -> Result<Boolean, JsValue> {
        let engine = self.get_engine_ref()?;

        let pointer = Pointer::decode(pointer_bytes)
            .map_err(|e| JsError::new(&format!("Failed to decode event pointer: {}", e)))?;

        let system = match pointer.system {
            Some(sys) => Ok(sys),
            None => Err(JsError::new(&"Event has no system")),
        }?;

        let process = match pointer.process {
            Some(proc) => Ok(proc),
            None => Err(JsError::new(&"Event has no process")),
        }?;

        let event_key = EventKey {
            system_key_type: system.key_type,
            system_key: system.key,
            process: process.process,
            logical_clock: pointer.logical_clock,
        };

        Ok(Boolean::from(engine.query_is_deleted(&event_key)))
    }

    /// Query follows for a system (LWW element set)
    #[wasm_bindgen]
    pub fn query_follows_for_system(&self, system_bytes: &[u8]) -> Result<Uint8Array, JsValue> {
        let engine = self.get_engine_ref()?;
        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;

        let signed_events = engine.get_lww_follows_for_system(&system_key);
        let events = Events {
            events: signed_events,
        };

        Ok(Uint8Array::from(events.encode_to_vec().as_slice()))
    }

    /// Query blocks for a system (LWW element set)
    #[wasm_bindgen]
    pub fn query_blocks_for_system(&self, system_bytes: &[u8]) -> Result<Uint8Array, JsValue> {
        let engine = self.get_engine_ref()?;
        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;

        let signed_events = engine.get_lww_blocks_for_system(&system_key);
        let events = Events {
            events: signed_events,
        };

        Ok(Uint8Array::from(events.encode_to_vec().as_slice()))
    }

    /// Query servers for a system (LWW element set)
    #[wasm_bindgen]
    pub fn query_servers_for_system(&self, system_bytes: &[u8]) -> Result<Uint8Array, JsValue> {
        let engine = self.get_engine_ref()?;
        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;

        let signed_events = engine.get_lww_servers_for_system(&system_key);
        let events = Events {
            events: signed_events,
        };

        Ok(Uint8Array::from(events.encode_to_vec().as_slice()))
    }

    /// Query authorities for a system (LWW element set)
    #[wasm_bindgen]
    pub fn query_authorities_for_system(&self, system_bytes: &[u8]) -> Result<Uint8Array, JsValue> {
        let engine = self.get_engine_ref()?;
        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;

        let signed_events = engine.get_lww_authorities_for_system(&system_key);
        let events = Events {
            events: signed_events,
        };

        Ok(Uint8Array::from(events.encode_to_vec().as_slice()))
    }

    /// Query topics for a system (LWW element set)
    #[wasm_bindgen]
    pub fn query_topics_for_system(&self, system_bytes: &[u8]) -> Result<Uint8Array, JsValue> {
        let engine = self.get_engine_ref()?;
        let system_key = engine
            .parse_system_key(system_bytes)
            .map_err(|e| JsError::new(&format!("Failed to parse system key: {}", e)))?;

        let signed_events = engine.get_lww_topics_for_system(&system_key);
        let events = Events {
            events: signed_events,
        };

        Ok(Uint8Array::from(events.encode_to_vec().as_slice()))
    }

    /// Query feed events for a system with cursor support for pagination
    ///
    /// # Arguments
    /// * `system_bytes` - Serialized system key bytes
    /// * `start_time` - Optional start time in unix milliseconds (inclusive)
    /// * `end_time` - Optional end time in unix milliseconds (inclusive)
    /// * `limit` - Optional limit on number of events to return
    /// * `cursor` - Optional cursor for pagination as Uint8Array
    ///
    /// # Returns
    /// * `Result<Uint8Array, JsValue>` - Serialized FeedResult protobuf bytes
    #[wasm_bindgen]
    pub fn query_feed_with_cursor(
        &self,
        system_bytes: &[u8],
        start_time: Option<u64>,
        end_time: Option<u64>,
        limit: Option<usize>,
        cursor: Option<Uint8Array>,
    ) -> Result<Uint8Array, JsValue> {
        let engine = self.get_engine_ref()?;

        let cursor_bytes = cursor.map(|c| c.to_vec());
        let result = engine
            .query_feed_with_cursor(
                system_bytes,
                start_time,
                end_time,
                limit,
                cursor_bytes.as_deref(),
            )
            .map_err(|e| JsError::new(&format!("Query feed failed: {}", e)))?;

        Ok(Uint8Array::from(&result[..]))
    }
}
