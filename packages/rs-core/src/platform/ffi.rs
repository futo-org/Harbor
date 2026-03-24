#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}

use base64::{prelude::BASE64_URL_SAFE_NO_PAD, Engine};
use libc::c_int;
use prost::Message;
use std::{
    collections::HashMap,
    ptr,
    sync::{RwLock, RwLockReadGuard, RwLockWriteGuard},
};

use crate::feeds::feed_helpers;
use crate::{
    query::{EventRangeQuery, QueryEngine},
    synchronization::sync_helpers::{fetch_event_request, prepare_sync_requests},
};
use polycentric_common::models::protos::reference::ReferenceType;
use polycentric_common::{
    models::internal::{EventKey, ProcessId, SystemKey, TimelineKey},
    models::{
        protos::{
            result, CommentsFeedState, Cursor, Events, FeedQuery, InternalFeedResult, LogicalClock,
            NetworkRequest, NetworkRequestResponse, NetworkRequestResponses, NetworkResponse,
            Option as ProtobufOption, QueryReferencesRequest, QueryReferencesRequestEvents,
            RangesForSystem, RepeatedUInt64, Result as ProtobufResult, ResultAndServerErrors,
            ResultEventsAndRelatedEventsAndCursor, SearchQuery, ServerCursors, ServerError,
            ServerFeedQuery,
        },
        ContentType, Digest, Event, EventCreationData, EventKey as ProtobufEventKey, Indices,
        LwwElement, Pointer, Process, PublicKey, Reference, Serializable, SignedEvent, VectorClock,
    },
    platform::PlatformError,
};

static ENGINE: RwLock<Option<QueryEngine>> = RwLock::new(None);

fn get_engine_read_lock() -> Result<RwLockReadGuard<'static, Option<QueryEngine>>, PlatformError> {
    let result = ENGINE.read();

    match result {
        Ok(lock) => Ok(lock),
        Err(err) => Err(PlatformError::QueryError(format!(
            "Failed obtain read lock on query engine: {}",
            err
        ))),
    }
}

fn get_engine_write_lock() -> Result<RwLockWriteGuard<'static, Option<QueryEngine>>, PlatformError>
{
    let result = ENGINE.write();

    match result {
        Ok(lock) => Ok(lock),
        Err(err) => Err(PlatformError::QueryError(format!(
            "Failed obtain write lock on query engine: {}",
            err
        ))),
    }
}

#[repr(C)]
pub struct CBuffer {
    pub bytes: *const u8,
    pub length: c_int,
}

// If you encounter any memory related issues, check the following three functions

fn c_pointer_to_byte_array(buf: CBuffer) -> Option<&'static [u8]> {
    if buf.bytes.is_null() {
        return None;
    }

    unsafe { Some(std::slice::from_raw_parts(buf.bytes, buf.length as usize)) }
}

fn byte_array_to_c_pointer(bytes: &[u8]) -> CBuffer {
    let bytes_vec = bytes.to_vec();
    let heap_data = bytes_vec.into_boxed_slice();
    let heap_ptr = Box::into_raw(heap_data);

    CBuffer {
        bytes: heap_ptr as *const u8,
        length: bytes.len() as c_int,
    }
}

/// Free a byte array returned by the rust core
/// This method MUST be used to free any and all byte arrays that are returned by the rust core
/// # Arguments
/// * `buf` - A byte array pointer that was previously returned by another rust core method
#[no_mangle]
pub extern "C" fn free_bytes(buf: CBuffer) {
    unsafe {
        // This is a bit hacky. Once the ptr::from_raw_parts method is stabilized, it should be used instead
        let slice = std::slice::from_raw_parts_mut(buf.bytes as *mut u8, buf.length as usize);

        let _heap_data = Box::from_raw(ptr::from_mut(slice));
    }
}

fn protobuf_result_ok(result: Vec<u8>) -> CBuffer {
    let result_protobuf = ProtobufResult {
        result: Some(result::Result::Value(result)),
    };

    let encoded = ProtobufResult::encode_to_vec(&result_protobuf);

    byte_array_to_c_pointer(&encoded)
}

fn protobuf_result_err(err: String) -> CBuffer {
    let result_protobuf = ProtobufResult {
        result: Some(result::Result::Error(err)),
    };

    let encoded = ProtobufResult::encode_to_vec(&result_protobuf);

    byte_array_to_c_pointer(&encoded)
}

fn protobuf_result_incomplete(requests: NetworkRequestResponses) -> CBuffer {
    let result_protobuf = ProtobufResult {
        result: Some(result::Result::Requests(requests)),
    };

    let encoded = ProtobufResult::encode_to_vec(&result_protobuf);

    byte_array_to_c_pointer(&encoded)
}

fn initialize_internal() -> Result<(), PlatformError> {
    let initialized = is_initialized_internal()?;

    if initialized {
        return Err(PlatformError::InvalidState(
            "Core is already initialized".to_owned(),
        ));
    }

    let mut writelock = get_engine_write_lock()?;

    *writelock = Some(QueryEngine::new());

    Ok(())
}

/// Initialize the polycentric rust core
/// # Returns
/// * `CBuffer` - Serialized protobuf result bytes. If no error occurs, the result will be empty.
#[no_mangle]
pub extern "C" fn initialize() -> CBuffer {
    match initialize_internal() {
        Ok(()) => protobuf_result_ok(vec![]),
        Err(err) => return protobuf_result_err(err.to_string()),
    }
}

fn is_initialized_internal() -> Result<bool, PlatformError> {
    let readlock = get_engine_read_lock()?;
    Ok((*readlock).is_some())
}

/// Check whether the rust core has been initialized
/// # Returns
/// * `CBuffer` - Serialized protobuf result bytes containing a single 1 byte if the rust core is initialized, or a 0 byte if it is not.
#[no_mangle]
pub extern "C" fn is_initialized() -> CBuffer {
    match is_initialized_internal() {
        Ok(true) => protobuf_result_ok(vec![1]),
        Ok(false) => protobuf_result_ok(vec![0]),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn ingest_event_internal(signed_event: &[u8]) -> std::result::Result<LogicalClock, PlatformError> {
    let signed_event = SignedEvent::from_bytes(signed_event) // from_bytes will verify the signature, decode will not
        .map_err(|e| {
            PlatformError::DeserializationError(format!("Failed to decode signed event: {}", e))
        })?;

    let logical_clock = if let Ok(event) = Event::decode(signed_event.event.as_slice()) {
        event.logical_clock
    } else {
        return Err(PlatformError::DeserializationError(
            "Failed to decode event from signed event".to_owned(),
        ));
    };

    let mut engine_lock = get_engine_write_lock()?;

    if let Some(ref mut engine) = *engine_lock {
        engine
            .ingest_event(signed_event)
            .map_err(|e| PlatformError::QueryError(format!("Failed to ingest event: {}", e)))?;

        Ok(LogicalClock {
            clock: logical_clock,
        })
    } else {
        Err(PlatformError::InvalidState(
            "Rust core has not been initialized".to_owned(),
        ))
    }
}

/// Ingest a signed event into the query engine.
///
/// # Arguments
/// * `signed_event` - Serialized SignedEvent protobuf bytes
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result bytes representing the logical clock of the ingested event or an error
#[no_mangle]
pub extern "C" fn ingest_event(signed_event: CBuffer) -> CBuffer {
    let signed_event_rust = match c_pointer_to_byte_array(signed_event) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    let result = ingest_event_internal(signed_event_rust);

    match result {
        Ok(clock) => protobuf_result_ok(clock.encode_to_vec()),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn create_event_internal(
    event_creation_data: &[u8],
    unix_ms: u64,
) -> std::result::Result<Vec<u8>, PlatformError> {
    let event_creation_data = EventCreationData::decode(event_creation_data).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to decode event creation data: {}", e))
    })?;

    let system = event_creation_data.system.ok_or_else(|| {
        PlatformError::InvalidEventCreationData("Event missing required data: System".to_string())
    })?;
    let process = event_creation_data.process.ok_or_else(|| {
        PlatformError::InvalidEventCreationData("Event missing required data: Process".to_string())
    })?;
    let content_type = ContentType::try_from(event_creation_data.content_type)
        .map_err(|_| PlatformError::DeserializationError("Invalid content type".into()))?;

    // Get logical clock (either provided or from callback)
    let logical_clock = event_creation_data.logical_clock.ok_or_else(|| {
        PlatformError::InvalidEventCreationData(
            "Event missing required data: logical clock".to_string(),
        )
    })?;

    let vector_clock;
    let mut engine_lock = get_engine_write_lock()?;

    if let Some(ref mut engine) = *engine_lock {
        vector_clock = engine
            .compute_vector_clock(&system.encode_to_vec(), &process.process, &|_, _| {
                Ok(logical_clock)
            })
            .unwrap_or_else(|_| VectorClock::empty());
    } else {
        vector_clock = VectorClock::empty();
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
        Some(unix_ms),
    );

    let event_bytes = event
        .to_bytes()
        .map_err(|e| PlatformError::SerializationError(format!("Failed to encode event: {}", e)))?;

    Ok(event_bytes)
}

/// Create an event.
/// Note that it is the wrapper's responsibility to sign the created event and then call ingest_event to insert it back into the rust core.
///
/// # Arguments
/// * `event_creation_data` - Serialized EventCreationData protobuf bytes
/// * `unix_ms` - The current unix timestamp
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result bytes containing the serialized protobuf Event bytes of the created event or an error
#[no_mangle]
pub extern "C" fn create_event(event_creation_data: CBuffer, unix_ms: u64) -> CBuffer {
    let event_creation_data_rust = match c_pointer_to_byte_array(event_creation_data) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match create_event_internal(event_creation_data_rust, unix_ms) {
        Ok(event) => protobuf_result_ok(event),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

enum NetworkResult {
    Complete(Vec<u8>),
    Incomplete(NetworkRequestResponses),
}

fn is_complete(requests: &NetworkRequestResponses) -> bool {
    for req in requests.pairs.iter() {
        if req.response.is_none() {
            return false;
        }
    }

    return true;
}

/// Synchronize the events that we have with the events that a server has
/// # Arguments
/// * `system` - Serialized PublicKey protobuf bytes
/// * `network_requests` - Serialized NetworkRequestResponses protobuf bytes
/// # Returns
/// * `CBuffer` - Serialized protobuf Result bytes containing the serialized protobuf ServerErrors bytes,
///                 the required network requests, or a core error
#[no_mangle]
pub extern "C" fn sync_events_for_system(system: CBuffer, network_requests: CBuffer) -> CBuffer {
    let system_rust = match c_pointer_to_byte_array(system) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match sync_events_for_system_internal(system_rust, network_requests_rust) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn sync_events_for_system_internal(
    system: &[u8],
    network_requests: &[u8],
) -> Result<NetworkResult, PlatformError> {
    let mut errors = vec![];
    let mut events = vec![];

    let current_system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided system public key: {:?}",
            e
        ))
    })?;

    let mut network_requests_protobuf =
        NetworkRequestResponses::decode(network_requests).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided network requests: {:?}",
                e
            ))
        })?;

    let mut result_sync_for_self = sync_events_for_target_system(
        &current_system_protobuf,
        &current_system_protobuf,
        &mut network_requests_protobuf,
        true,
    )?;
    errors.append(&mut result_sync_for_self.1);
    events.append(&mut result_sync_for_self.0);

    let followed_profiles;
    let opinions;
    {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

        let system_key = SystemKey::from_public_key(&current_system_protobuf);

        followed_profiles = engine.query_follows_for_system(&system_key).map_err(|e| {
            PlatformError::QueryError(format!("Unable to query followed profiles: {:?}", e))
        })?;
        opinions = engine
            .query_opinions_for_system(&system_key)
            .map_err(|e| PlatformError::QueryError(format!("Unable to query opinions: {:?}", e)))?;
    }

    for profile in followed_profiles {
        let mut sync_result = sync_events_for_target_system(
            &current_system_protobuf,
            &profile,
            &mut network_requests_protobuf,
            false,
        )?;
        errors.append(&mut sync_result.1);
        events.append(&mut sync_result.0);
    }

    for (event_key, _lww) in opinions {
        let event = match fetch_event(
            &current_system_protobuf,
            event_key,
            &mut network_requests_protobuf,
        ) {
            Err(_) => continue,
            Ok(None) => continue,
            Ok(Some(evt)) => evt,
        };

        events.push(event);
    }

    if !is_complete(&network_requests_protobuf) {
        return Ok(NetworkResult::Incomplete(network_requests_protobuf));
    }

    let errors_protobuf = ResultAndServerErrors {
        result: Events { events }.encode_to_vec(),
        errors,
    };
    let errors_bytes = errors_protobuf.encode_to_vec();
    Ok(NetworkResult::Complete(errors_bytes))
}

fn fetch_event(
    current_system_protobuf: &PublicKey,
    event_key: EventKey,
    network_requests: &mut NetworkRequestResponses,
) -> Result<Option<SignedEvent>, PlatformError> {
    let servers;
    {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

        if let Some(event) = engine.event_store.get_event_raw(&event_key) {
            return Ok(Some(event.to_owned()));
        }

        servers = engine
            .query_servers_for_system(&SystemKey::from_public_key(&current_system_protobuf))
            .map_err(|e| PlatformError::QueryError(format!("Unable to query servers: {:?}", e)))?;
    }

    for server in servers {
        let result = match fetch_event_from_server(server, &event_key, network_requests) {
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

fn fetch_event_from_server(
    server: String,
    event_key: &EventKey,
    network_requests: &mut NetworkRequestResponses,
) -> Result<Option<SignedEvent>, PlatformError> {
    let request = fetch_event_request(event_key);
    let request_bytes = request.encode_to_vec();

    let system = PublicKey {
        key_type: event_key.system_key_type,
        key: event_key.system_key.clone(),
    };

    let system_bytes = system.to_bytes().map_err(|e| {
        PlatformError::SerializationError(format!("Unable to serialize public key: {:?}", e))
    })?;

    let mut get_events_params = HashMap::new();
    get_events_params.insert(
        "system".to_string(),
        BASE64_URL_SAFE_NO_PAD.encode(system_bytes),
    );
    get_events_params.insert(
        "ranges".to_string(),
        BASE64_URL_SAFE_NO_PAD.encode(request_bytes),
    );
    let get_events_request = NetworkRequest {
        server: server.clone(),
        method: "GET".to_string(),
        endpoint: "events".to_string(),
        parameters: get_events_params,
        body: None,
    };
    let get_events_response = get_response(&get_events_request, network_requests);

    let get_response_bytes = match get_events_response {
        Some(body) => match body.body {
            Some(bytes) => bytes,
            None => return Err(PlatformError::QueryError("No  value".to_string())),
        },
        None => return Err(PlatformError::QueryError("No head value".to_string())),
    };
    let get_response_protobuf = Events::from_bytes(&get_response_bytes[..]).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize head endpoint response: {:?}",
            e
        ))
    })?;

    for event in get_response_protobuf.events.iter() {
        ingest_event_internal(&event.encode_to_vec()[..])?;
    }

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

    ingest_event_internal(&signed_event.encode_to_vec()[..])?;

    return Ok(Some(signed_event));
}

fn sync_events_for_target_system(
    current_system_protobuf: &PublicKey,
    target_system_protobuf: &PublicKey,
    network_requests: &mut NetworkRequestResponses,
    post_events: bool,
) -> Result<(Vec<SignedEvent>, Vec<ServerError>), PlatformError> {
    let servers;
    {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

        servers = engine
            .query_servers_for_system(&SystemKey::from_public_key(&current_system_protobuf))
            .map_err(|e| PlatformError::QueryError(format!("Unable to query servers: {:?}", e)))?;
    }

    let mut events = vec![];
    let mut errors = vec![];

    for server in servers {
        match sync_events_with_server(
            server.clone(),
            &target_system_protobuf,
            network_requests,
            post_events,
        ) {
            Ok(mut evts) => events.append(&mut evts),
            Err(err) => errors.push(ServerError {
                server,
                error: err.to_string(),
            }),
        }
    }

    Ok((events, errors))
}

fn get_response(
    request: &NetworkRequest,
    responses: &mut NetworkRequestResponses,
) -> Option<NetworkResponse> {
    for pair in responses.pairs.iter() {
        if let Some(pair_request) = pair.request.as_ref() {
            if *pair_request == *request {
                return pair.response.clone();
            }
        }
    }

    responses.pairs.push(NetworkRequestResponse {
        request: Some(request.clone()),
        response: None,
    });

    None
}

fn sync_events_with_server(
    server: String,
    system_protobuf: &PublicKey,
    network_requests: &mut NetworkRequestResponses,
    post_events: bool,
) -> Result<Vec<SignedEvent>, PlatformError> {
    let mut incomplete = false;

    let mut head_params = HashMap::new();
    head_params.insert(
        "system".to_string(),
        BASE64_URL_SAFE_NO_PAD.encode(system_protobuf.encode_to_vec()),
    );
    let head_request = NetworkRequest {
        server: server.clone(),
        method: "GET".to_string(),
        endpoint: "head".to_string(),
        parameters: head_params,
        body: None,
    };
    let head_response = get_response(&head_request, network_requests);

    if head_response.is_none() {
        incomplete = true;
    }

    let mut ranges_params = HashMap::new();
    ranges_params.insert(
        "system".to_string(),
        BASE64_URL_SAFE_NO_PAD.encode(system_protobuf.encode_to_vec()),
    );
    let ranges_request = NetworkRequest {
        server: server.clone(),
        method: "GET".to_string(),
        endpoint: "ranges".to_string(),
        parameters: ranges_params,
        body: None,
    };
    let ranges_response = get_response(&ranges_request, network_requests);

    if ranges_response.is_none() {
        incomplete = true;
    }

    if incomplete {
        return Ok(vec![]);
    }

    let head_bytes = match head_response {
        Some(body) => match body.body {
            Some(bytes) => bytes,
            None => return Err(PlatformError::QueryError("No head value".to_string())),
        },
        None => return Err(PlatformError::QueryError("No head value".to_string())),
    };
    let head_protobuf = Events::from_bytes(&head_bytes[..]).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize head endpoint response: {:?}",
            e
        ))
    })?;

    let ranges_bytes = match ranges_response {
        Some(body) => match body.body {
            Some(bytes) => bytes,
            None => return Err(PlatformError::QueryError("No ranges value".to_string())),
        },
        None => return Err(PlatformError::QueryError("No ranges value".to_string())),
    };
    let ranges_protobuf = RangesForSystem::decode(&ranges_bytes[..]).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize ranges endpoint response: {:?}",
            e
        ))
    })?;

    let requests;
    {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;
        requests =
            prepare_sync_requests(engine, &system_protobuf, &head_protobuf, &ranges_protobuf)
                .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;
    }

    let mut get_events_params = HashMap::new();
    get_events_params.insert(
        "system".to_string(),
        BASE64_URL_SAFE_NO_PAD.encode(system_protobuf.encode_to_vec()),
    );
    get_events_params.insert(
        "ranges".to_string(),
        BASE64_URL_SAFE_NO_PAD.encode(requests.ranges_to_get.encode_to_vec()),
    );
    let get_events_request = NetworkRequest {
        server: server.clone(),
        method: "GET".to_string(),
        endpoint: "events".to_string(),
        parameters: get_events_params,
        body: None,
    };
    let get_events_response = get_response(&get_events_request, network_requests);
    if get_events_response.is_none() {
        incomplete = true;
    }

    if post_events {
        let post_events_request = NetworkRequest {
            server: server.clone(),
            method: "POST".to_string(),
            endpoint: "events".to_string(),
            parameters: HashMap::new(),
            body: Some(requests.events_to_post.encode_to_vec()),
        };
        let post_events_response = get_response(&post_events_request, network_requests);
        if post_events_response.is_none() {
            incomplete = true;
        }

        if incomplete {
            return Ok(vec![]);
        }
    }

    let get_response_bytes = match get_events_response {
        Some(body) => match body.body {
            Some(bytes) => bytes,
            None => return Err(PlatformError::QueryError("No  value".to_string())),
        },
        None => return Err(PlatformError::QueryError("No head value".to_string())),
    };
    let get_response_protobuf = Events::from_bytes(&get_response_bytes[..]).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize head endpoint response: {:?}",
            e
        ))
    })?;

    for event in get_response_protobuf.events.iter() {
        ingest_event_internal(&event.encode_to_vec()[..])?;
    }

    Ok(get_response_protobuf.events)
}

/// Get a reference (EventKey) from a Pointer.
///
/// # Arguments
/// * `pointer_bytes` - Serialized Pointer protobuf bytes
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing a serialized protobuf Option containing serialized protobuf EventKey or null if not found.
#[no_mangle]
pub extern "C" fn get_reference(pointer_bytes: CBuffer) -> CBuffer {
    let pointer_bytes_rust = match c_pointer_to_byte_array(pointer_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match get_reference_internal(pointer_bytes_rust) {
        Ok(events) => protobuf_result_ok(events),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn get_reference_internal(pointer_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let pointer = Pointer::decode(pointer_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to decode pointer: {}", e))
    })?;

    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    match engine.get_reference(&pointer) {
        Ok(Some(event_key)) => {
            let proto_event_key = ProtobufEventKey {
                system_key_type: event_key.system_key_type,
                system_key: event_key.system_key,
                process: event_key.process,
                logical_clock: event_key.logical_clock,
            };
            let proto_option = ProtobufOption {
                value: Some(proto_event_key.encode_to_vec()),
            };
            Ok(proto_option.encode_to_vec())
        }
        Ok(None) => Ok(ProtobufOption { value: None }.encode_to_vec()),
        Err(e) => Err(PlatformError::Unknown(format!("get_reference failed: {}", e)).into()),
    }
}

/// Get a Pointer to the given Event
///
/// # Arguments
/// * `event_bytes` - Serialized Event protobuf bytes
///
/// # Returns
/// * `CBuffer` - Serialized Pointer protobuf bytes or null if not found
#[no_mangle]
pub extern "C" fn get_pointer(event_bytes: CBuffer) -> CBuffer {
    let event_bytes_rust = match c_pointer_to_byte_array(event_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match get_pointer_internal(event_bytes_rust) {
        Ok(events) => protobuf_result_ok(events),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn get_pointer_internal(event_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let event = Event::decode(event_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to decode event: {}", e))
    })?;

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

    Ok(pointer_bytes)
}

struct ResultEventsAndCursor {
    events: Events,
    cursor: Option<Vec<u8>>,
}

/// Helper function to query a feed for all servers for a given system, and then deduplicate the results
fn query_feed_for_all_servers(
    system: &PublicKey,
    cursors: &mut ServerCursors,
    per_server_limit: Option<usize>,
    mut query_callback: impl FnMut(
        String,
        Option<&Vec<u8>>,
    ) -> Result<ResultEventsAndCursor, PlatformError>,
) -> Result<ResultAndServerErrors, PlatformError> {
    let servers;
    {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

        servers = engine
            .query_servers_for_system(&SystemKey::from_public_key(system))
            .map_err(|e| PlatformError::QueryError(format!("Unable to query servers: {:?}", e)))?;
    }

    let mut server_feeds: Vec<Vec<SignedEvent>> = vec![];
    let mut errors: Vec<ServerError> = vec![];

    for server in servers {
        let cursor_bytes;
        let cursor_protobuf = cursors.cursors.get(&server);
        if let Some(cursor) = cursor_protobuf {
            cursor_bytes = match cursor.value {
                Some(ref bytes) => Some(bytes),
                None => continue, // If we have an empty cursor set, we are done querying this server
            };
        } else {
            cursor_bytes = None;
        }

        let response = match query_callback(server.clone(), cursor_bytes) {
            Ok(resp) => resp,
            Err(err) => {
                errors.push(ServerError {
                    server: server.clone(),
                    error: format!("{:?}", err),
                });
                continue;
            }
        };

        server_feeds.push(response.events.events);

        cursors.cursors.insert(
            server,
            ProtobufOption {
                value: response.cursor,
            },
        );
    }

    let events_unfiltered = feed_helpers::deduplicate_events(feed_helpers::combine_server_feeds(
        server_feeds,
        per_server_limit,
    ))
    .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;

    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let events = engine
        .filter_feed(&SystemKey::from_public_key(system), &events_unfiltered)
        .map_err(|e| PlatformError::Unknown(format!("{:?}", e)))?;

    let events_protobuf = Events { events };

    let events_bytes = Events::to_bytes(&events_protobuf).map_err(|e| {
        PlatformError::SerializationError(format!("Unable to serialize events object: {:?}", e))
    })?;

    Ok(ResultAndServerErrors {
        result: events_bytes,
        errors,
    })
}

/// Queries the explore feed for a given system
///
/// # Arguments
/// * `system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `network_requests_bytes` - Serialized NetworkRequestResponses protobuf bytes representing prior network requests and responses
/// * `feed_query_bytes` - Serialized ServerFeedQuery protobuf bytes representing the feed query parameters
/// * `cursor_bytes` - Serialized Cursor protobuf bytes representing the current feed cursor
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_explore_feed(
    system_bytes: CBuffer,
    network_requests_bytes: CBuffer,
    feed_query_bytes: CBuffer,
    cursor_bytes: CBuffer,
) -> CBuffer {
    let system_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let feed_query_rust = match c_pointer_to_byte_array(feed_query_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let cursor_rust = match c_pointer_to_byte_array(cursor_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_explore_feed_internal(
        system_rust,
        network_requests_rust,
        feed_query_rust,
        cursor_rust,
    ) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_explore_feed_internal(
    system: &[u8],
    network_requests: &[u8],
    feed_query: &[u8],
    cursor: &[u8],
) -> Result<NetworkResult, PlatformError> {
    let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided system public key: {:?}",
            e
        ))
    })?;

    let mut network_requests_protobuf =
        NetworkRequestResponses::decode(network_requests).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided network requests: {:?}",
                e
            ))
        })?;

    let feed_query_protobuf = ServerFeedQuery::decode(feed_query).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided server feed query: {:?}",
            e
        ))
    })?;

    let cursor_protobuf = Cursor::decode(cursor).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided cursor: {:?}",
            e
        ))
    })?;

    let mut cursors = match cursor_protobuf.cursor {
        Some(curs) => ServerCursors::decode(&curs[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided cursor: {:?}",
                e
            ))
        })?,
        None => ServerCursors {
            cursors: HashMap::new(),
        },
    };

    let per_server_limit = match feed_query_protobuf.per_server_limit {
        Some(limit) => Some(limit as usize),
        None => None,
    };

    let result = query_feed_for_all_servers(
        &system_protobuf,
        &mut cursors,
        per_server_limit,
        |server, cursor| {
            let mut get_explore_params = HashMap::new();
            if let Some(limit) = per_server_limit {
                get_explore_params.insert("limit".to_string(), limit.to_string());
            }
            if let Some(filters) = feed_query_protobuf.moderation_filters.clone() {
                get_explore_params.insert("moderation_filters".to_string(), filters);
            }
            if let Some(cursor) = cursor {
                get_explore_params.insert(
                    "cursor".to_string(),
                    BASE64_URL_SAFE_NO_PAD.encode(cursor.to_owned()),
                );
            }
            let get_explore_request = NetworkRequest {
                server: server.clone(),
                method: "GET".to_string(),
                endpoint: "explore".to_string(),
                parameters: get_explore_params,
                body: None,
            };
            let get_explore_response =
                get_response(&get_explore_request, &mut network_requests_protobuf);
            let response = get_explore_response.ok_or(PlatformError::QueryError(
                "No server response given".to_string(),
            ))?;
            let body = response.body.ok_or(PlatformError::QueryError(
                "Server response had no body".to_string(),
            ))?;

            let result = ResultEventsAndRelatedEventsAndCursor::decode(&body[..]).map_err(|e| {
                PlatformError::DeserializationError(format!(
                    "Unable to deserialize events object: {:?}",
                    e
                ))
            })?;

            if let Some(events) = result.related_events {
                for event in events.events {
                    let _ = ingest_event_internal(&event.encode_to_vec());
                }
            }

            if let Some(events) = result.result_events.clone() {
                for event in events.events {
                    let _ = ingest_event_internal(&event.encode_to_vec());
                }
            }

            let events = match result.result_events {
                Some(evts) => evts,
                None => Events { events: vec![] },
            };

            Ok(ResultEventsAndCursor {
                events,
                cursor: result.cursor,
            })
        },
    )?;

    if !is_complete(&network_requests_protobuf) {
        return Ok(NetworkResult::Incomplete(network_requests_protobuf));
    }

    let result_full = InternalFeedResult {
        result: Some(result),
        cursor: Some(Cursor {
            cursor: Some(cursors.encode_to_vec()),
        }),
    };

    let result_bytes = result_full.encode_to_vec();
    Ok(NetworkResult::Complete(result_bytes))
}

/// Queries the search feed for a given system
///
/// # Arguments
/// * `system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `network_requests_bytes` - Serialized NetworkRequestResponses protobuf bytes representing prior network requests and responses
/// * `feed_query_bytes` - Serialized ServerFeedQuery protobuf bytes representing the feed query parameters
/// * `search_query_bytes` - Serialized SearchQuery protobuf bytes representing the search query parameters
/// * `cursor_bytes` - Serialized Cursor protobuf bytes representing the current feed cursor
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_search_feed(
    system_bytes: CBuffer,
    network_requests_bytes: CBuffer,
    feed_query_bytes: CBuffer,
    search_query_bytes: CBuffer,
    cursor_bytes: CBuffer,
) -> CBuffer {
    let system_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let feed_query_rust = match c_pointer_to_byte_array(feed_query_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let search_query_rust = match c_pointer_to_byte_array(search_query_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let cursor_rust = match c_pointer_to_byte_array(cursor_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_search_feed_internal(
        system_rust,
        network_requests_rust,
        feed_query_rust,
        search_query_rust,
        cursor_rust,
    ) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_search_feed_internal(
    system: &[u8],
    network_requests: &[u8],
    feed_query: &[u8],
    search_query: &[u8],
    cursor: &[u8],
) -> Result<NetworkResult, PlatformError> {
    let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided system public key: {:?}",
            e
        ))
    })?;

    let mut network_requests_protobuf =
        NetworkRequestResponses::decode(network_requests).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided network requests: {:?}",
                e
            ))
        })?;

    let feed_query_protobuf = ServerFeedQuery::decode(feed_query).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided server feed query: {:?}",
            e
        ))
    })?;

    let search_query_protobuf = SearchQuery::decode(search_query).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided search query: {:?}",
            e
        ))
    })?;

    let cursor_protobuf = Cursor::decode(cursor).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided cursor: {:?}",
            e
        ))
    })?;

    let mut cursors = match cursor_protobuf.cursor {
        Some(curs) => ServerCursors::decode(&curs[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided cursor: {:?}",
                e
            ))
        })?,
        None => ServerCursors {
            cursors: HashMap::new(),
        },
    };

    let per_server_limit = match feed_query_protobuf.per_server_limit {
        Some(limit) => Some(limit as usize),
        None => None,
    };

    let result = query_feed_for_all_servers(
        &system_protobuf,
        &mut cursors,
        per_server_limit,
        |server, cursor| {
            let mut get_search_params = HashMap::new();
            get_search_params.insert(
                "search".to_string(),
                search_query_protobuf.query.to_string(),
            );
            get_search_params.insert(
                "search_type".to_string(),
                search_query_protobuf.r#type().as_str_name().to_string(),
            );

            if let Some(limit) = per_server_limit {
                get_search_params.insert("limit".to_string(), limit.to_string());
            }
            if let Some(filters) = feed_query_protobuf.moderation_filters.clone() {
                get_search_params.insert("moderation_filters".to_string(), filters);
            }
            if let Some(cursor) = cursor {
                get_search_params.insert(
                    "cursor".to_string(),
                    BASE64_URL_SAFE_NO_PAD.encode(cursor.to_owned()),
                );
            }
            let get_search_request = NetworkRequest {
                server: server.clone(),
                method: "GET".to_string(),
                endpoint: "search".to_string(),
                parameters: get_search_params,
                body: None,
            };
            let get_search_response =
                get_response(&get_search_request, &mut network_requests_protobuf);
            let response = get_search_response.ok_or(PlatformError::QueryError(
                "No server response given".to_string(),
            ))?;
            let body = response.body.ok_or(PlatformError::QueryError(
                "Server response had no body".to_string(),
            ))?;

            let result = ResultEventsAndRelatedEventsAndCursor::decode(&body[..]).map_err(|e| {
                PlatformError::DeserializationError(format!(
                    "Unable to deserialize events object: {:?}",
                    e
                ))
            })?;

            if let Some(events) = result.related_events {
                for event in events.events {
                    let _ = ingest_event_internal(&event.encode_to_vec());
                }
            }

            if let Some(events) = result.result_events.clone() {
                for event in events.events {
                    let _ = ingest_event_internal(&event.encode_to_vec());
                }
            }

            let events = match result.result_events {
                Some(evts) => evts,
                None => Events { events: vec![] },
            };

            Ok(ResultEventsAndCursor {
                events,
                cursor: result.cursor,
            })
        },
    )?;

    if !is_complete(&network_requests_protobuf) {
        return Ok(NetworkResult::Incomplete(network_requests_protobuf));
    }

    let result_full = InternalFeedResult {
        result: Some(result),
        cursor: Some(Cursor {
            cursor: Some(cursors.encode_to_vec()),
        }),
    };

    let result_bytes = result_full.encode_to_vec();
    Ok(NetworkResult::Complete(result_bytes))
}

/// Queries the feed of events created by a given system
///
/// # Arguments
/// * `current_system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `target_system_bytes` - Serialized PublicKey protobuf bytes representing the target system whose author feed should be queried
/// * `network_requests_bytes` - Serialized NetworkRequestResponses protobuf bytes representing prior network requests and responses
/// * `limit` - Maximum number of events to return
/// * `latest_event_bytes` - Serialized Event bytes for the latest event from the previous page, or empty bytes for first page
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_author_feed(
    current_system_bytes: CBuffer,
    target_system_bytes: CBuffer,
    network_requests_bytes: CBuffer,
    limit: u64,
    latest_event_bytes: CBuffer,
) -> CBuffer {
    let current_system_rust = match c_pointer_to_byte_array(current_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let target_system_rust = match c_pointer_to_byte_array(target_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let latest_event_rust = match c_pointer_to_byte_array(latest_event_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_author_feed_internal(
        current_system_rust,
        target_system_rust,
        network_requests_rust,
        limit as usize,
        latest_event_rust,
    ) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_author_feed_internal(
    current_system: &[u8],
    target_system: &[u8],
    network_requests: &[u8],
    limit: usize,
    latest_event: &[u8],
) -> Result<NetworkResult, PlatformError> {
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

    let mut network_requests_protobuf =
        NetworkRequestResponses::decode(network_requests).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided network requests: {:?}",
                e
            ))
        })?;

    sync_events_for_target_system(
        &current_system_protobuf,
        &target_system_protobuf,
        &mut network_requests_protobuf,
        false,
    )?;

    if !is_complete(&network_requests_protobuf) {
        return Ok(NetworkResult::Incomplete(network_requests_protobuf));
    }

    let system_key = SystemKey {
        key_type: target_system_protobuf.key_type,
        key: target_system_protobuf.key,
    };

    let latest = decode_latest_event(latest_event)?;

    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let feed = engine
        .query_author_feed(&system_key, limit, latest)
        .map_err(|e| PlatformError::QueryError(format!("Unable to query author feed: {:?}", e)))?;

    let events_protobuf = Events { events: feed };

    let result_full = InternalFeedResult {
        result: Some(ResultAndServerErrors {
            result: events_protobuf.encode_to_vec(),
            errors: vec![],
        }),
        cursor: None,
    };

    Ok(NetworkResult::Complete(result_full.encode_to_vec()))
}

fn decode_latest_event(latest_event: &[u8]) -> Result<Option<TimelineKey>, PlatformError> {
    if latest_event.is_empty() {
        return Ok(None);
    }

    let event = Event::from_bytes(latest_event).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided event object: {:?}",
            e
        ))
    })?;

    Ok(Some(TimelineKey::from_event(&event).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to derive timeline key from provided event: {:?}",
            e
        ))
    })?))
}

/// Queries the feed of events from users that the current system is following
///
/// # Arguments
/// * `current_system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `limit` - Maximum number of events to return
/// * `latest_event_bytes` - Serialized Event bytes for the latest event from the previous page, or empty bytes for first page
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_following_feed(
    current_system_bytes: CBuffer,
    limit: u64,
    latest_event_bytes: CBuffer,
) -> CBuffer {
    let current_system_rust = match c_pointer_to_byte_array(current_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let latest_event_rust = match c_pointer_to_byte_array(latest_event_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_following_feed_internal(current_system_rust, limit as usize, latest_event_rust) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_following_feed_internal(
    system: &[u8],
    limit: usize,
    latest_event: &[u8],
) -> Result<NetworkResult, PlatformError> {
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

    let latest = decode_latest_event(latest_event)?;

    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let feed = engine
        .query_following_feed(&system_key, limit, latest)
        .map_err(|e| {
            PlatformError::QueryError(format!("Unable to query following feed: {:?}", e))
        })?;

    let events_protobuf = Events { events: feed };

    let result_full = InternalFeedResult {
        result: Some(ResultAndServerErrors {
            result: events_protobuf.encode_to_vec(),
            errors: vec![],
        }),
        cursor: None,
    };

    Ok(NetworkResult::Complete(result_full.encode_to_vec()))
}

/// Queries the feed of events with a given reference
///
/// # Arguments
/// * `system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `network_requests_bytes` - Serialized NetworkRequestResponses protobuf bytes representing prior network requests and responses
/// * `feed_query_bytes` - Serialized ServerFeedQuery protobuf bytes representing the feed query parameters
/// * `reference_bytes` - Serialized Reference protobuf bytes representing the reference to query
/// * `cursor_bytes` - Serialized Cursor protobuf bytes representing the current feed cursor
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_references_feed(
    system_bytes: CBuffer,
    network_requests_bytes: CBuffer,
    feed_query_bytes: CBuffer,
    reference_bytes: CBuffer,
    cursor_bytes: CBuffer,
) -> CBuffer {
    let system_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let feed_query_rust = match c_pointer_to_byte_array(feed_query_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let reference_rust = match c_pointer_to_byte_array(reference_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let cursor_rust = match c_pointer_to_byte_array(cursor_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_references_feed_internal(
        system_rust,
        network_requests_rust,
        feed_query_rust,
        reference_rust,
        cursor_rust,
    ) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_references_feed_internal(
    system: &[u8],
    network_requests: &[u8],
    feed_query: &[u8],
    reference: &[u8],
    cursor: &[u8],
) -> Result<NetworkResult, PlatformError> {
    let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided system public key: {:?}",
            e
        ))
    })?;

    let mut network_requests_protobuf =
        NetworkRequestResponses::decode(network_requests).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided network requests: {:?}",
                e
            ))
        })?;

    let feed_query_protobuf = ServerFeedQuery::decode(feed_query).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided server feed query: {:?}",
            e
        ))
    })?;

    let reference_protobuf = Reference::decode(reference).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided reference: {:?}",
            e
        ))
    })?;

    let cursor_protobuf = Cursor::decode(cursor).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided cursor: {:?}",
            e
        ))
    })?;

    let mut cursors = match cursor_protobuf.cursor {
        Some(curs) => ServerCursors::decode(&curs[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided cursor: {:?}",
                e
            ))
        })?,
        None => ServerCursors {
            cursors: HashMap::new(),
        },
    };

    let per_server_limit = match feed_query_protobuf.per_server_limit {
        Some(limit) => Some(limit as usize),
        None => None,
    };

    let result = query_feed_for_all_servers(
        &system_protobuf,
        &mut cursors,
        per_server_limit,
        |server, cursor| {
            let query = QueryReferencesRequest {
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

            let mut get_query_references_params = HashMap::new();
            get_query_references_params.insert(
                "query".to_string(),
                BASE64_URL_SAFE_NO_PAD.encode(query.encode_to_vec()),
            );

            if let Some(filters) = feed_query_protobuf.moderation_filters.clone() {
                get_query_references_params.insert("moderation_filters".to_string(), filters);
            }
            let get_query_references_request = NetworkRequest {
                server: server.clone(),
                method: "GET".to_string(),
                endpoint: "query_references".to_string(),
                parameters: get_query_references_params,
                body: None,
            };
            let get_query_references_response = get_response(
                &get_query_references_request,
                &mut network_requests_protobuf,
            );
            let response = get_query_references_response.ok_or(PlatformError::QueryError(
                "No server response given".to_string(),
            ))?;
            let body = response.body.ok_or(PlatformError::QueryError(
                "Server response had no body".to_string(),
            ))?;

            let result = ResultEventsAndRelatedEventsAndCursor::decode(&body[..]).map_err(|e| {
                PlatformError::DeserializationError(format!(
                    "Unable to deserialize events object: {:?}",
                    e
                ))
            })?;

            if let Some(events) = result.related_events {
                for event in events.events {
                    let _ = ingest_event_internal(&event.encode_to_vec());
                }
            }

            if let Some(events) = result.result_events.clone() {
                for signed_event in events.events {
                    if ingest_event_internal(&signed_event.encode_to_vec()).is_err() {
                        continue;
                    }

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

            let events = match result.result_events {
                Some(evts) => evts,
                None => Events { events: vec![] },
            };

            Ok(ResultEventsAndCursor {
                events,
                cursor: result.cursor,
            })
        },
    )?;

    if !is_complete(&network_requests_protobuf) {
        return Ok(NetworkResult::Incomplete(network_requests_protobuf));
    }

    let result_full = InternalFeedResult {
        result: Some(result),
        cursor: Some(Cursor {
            cursor: Some(cursors.encode_to_vec()),
        }),
    };

    let result_bytes = result_full.encode_to_vec();
    Ok(NetworkResult::Complete(result_bytes))
}

/// Queries the feed of comments on the current user's posts
///
/// # Arguments
/// * `system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `network_requests_bytes` - Serialized NetworkRequestResponses protobuf bytes representing prior network requests and responses
/// * `feed_query_bytes` - Serialized ServerFeedQuery protobuf bytes representing the feed query parameters
/// * `cursor_bytes` - Serialized Cursor protobuf bytes representing the current feed cursor
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_comments_feed(
    system_bytes: CBuffer,
    network_requests_bytes: CBuffer,
    feed_query_bytes: CBuffer,
    cursor_bytes: CBuffer,
) -> CBuffer {
    let system_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let feed_query_rust = match c_pointer_to_byte_array(feed_query_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let cursor_rust = match c_pointer_to_byte_array(cursor_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_comments_feed_internal(
        system_rust,
        network_requests_rust,
        feed_query_rust,
        cursor_rust,
    ) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_comments_feed_internal(
    system: &[u8],
    network_requests: &[u8],
    feed_query: &[u8],
    cursor: &[u8],
) -> Result<NetworkResult, PlatformError> {
    let system_protobuf = PublicKey::from_bytes(system).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided system public key: {:?}",
            e
        ))
    })?;

    let cursor_protobuf = Cursor::decode(cursor).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided cursor: {:?}",
            e
        ))
    })?;

    let feed_state = match cursor_protobuf.cursor {
        Some(ref curs) => Some(CommentsFeedState::decode(&curs[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided feed state: {:?}",
                e
            ))
        })?),
        None => None,
    };

    let event = if let Some(ref state) = feed_state {
        let event = SignedEvent::from_bytes(&state.event[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided event in feed state: {:?}",
                e
            ))
        })?;

        event
    } else {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

        let latest = engine
            .query_next_event_for_system(&SystemKey::from_public_key(&system_protobuf), None)
            .map_err(|e| {
                PlatformError::QueryError(format!(
                    "Unable to query latest event for system: {:?}",
                    e
                ))
            })?;

        match latest {
            Some(event) => event,

            // If there is no latest event, the feed should be empty
            None => {
                return Ok(NetworkResult::Complete(
                    InternalFeedResult {
                        result: Some(ResultAndServerErrors {
                            result: Events { events: vec![] }.encode_to_vec(),
                            errors: vec![],
                        }),
                        cursor: Some(cursor_protobuf),
                    }
                    .encode_to_vec(),
                ))
            }
        }
    };

    let cursors = match feed_state {
        Some(state) => match state.cursors {
            Some(cursors) => cursors,
            None => ServerCursors {
                cursors: HashMap::new(),
            },
        },
        None => ServerCursors {
            cursors: HashMap::new(),
        },
    };

    let pointer = get_pointer_internal(&event.event[..]).map_err(|e| {
        PlatformError::QueryError(format!("Unable to query pointer to event: {:?}", e))
    })?;

    let reference = Reference {
        reference_type: ReferenceType::Pointer as u64,
        reference: pointer.to_vec(),
    };

    let reference_bytes = reference.to_bytes().map_err(|e| {
        PlatformError::SerializationError(format!("Unable to serialize reference object: {:?}", e))
    })?;

    let references_feed_cursor = Cursor {
        cursor: Some(cursors.encode_to_vec()),
    };

    let query_references_result = query_references_feed_internal(
        system,
        network_requests,
        feed_query,
        &reference_bytes[..],
        &references_feed_cursor.encode_to_vec()[..],
    )?;

    let result = match query_references_result {
        NetworkResult::Incomplete(ref _response) => return Ok(query_references_result),
        NetworkResult::Complete(res) => InternalFeedResult::decode(&res[..]).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize query references result: {:?}",
                e
            ))
        })?,
    };

    let result_events = Events::decode(
        &result
            .result
            .clone()
            .ok_or(PlatformError::QueryError(
                "Result field is not set".to_string(),
            ))?
            .result[..],
    )
    .map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize query references result events: {:?}",
            e
        ))
    })?;

    let new_cursors = match result.cursor {
        None => None,
        Some(curs) => match curs.cursor {
            None => None,
            Some(bytes) => {
                let server_cursors = ServerCursors::decode(&bytes[..]).map_err(|e| {
                    PlatformError::DeserializationError(format!(
                        "Unable to deserialize query references result cursor: {:?}",
                        e
                    ))
                })?;

                Some(server_cursors)
            }
        },
    };

    let new_feed_state = if result_events.events.len() == 0 {
        let current_event = Event::from_bytes(&event.event).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize event object: {:?}",
                e
            ))
        })?;

        let current_event_key = TimelineKey::from_event(&current_event).map_err(|e| {
            PlatformError::QueryError(format!("Unable to derive timeline key from event: {:?}", e))
        })?;

        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

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
            CommentsFeedState {
                event: next.encode_to_vec(),
                cursors: Some(ServerCursors {
                    cursors: HashMap::new(),
                }),
            }
        } else {
            CommentsFeedState {
                event: event.encode_to_vec(),
                cursors: new_cursors,
            }
        }
    } else {
        CommentsFeedState {
            event: event.encode_to_vec(),
            cursors: new_cursors,
        }
    };

    let result_full = InternalFeedResult {
        result: result.result,
        cursor: Some(Cursor {
            cursor: Some(new_feed_state.encode_to_vec()),
        }),
    };

    let result_bytes = result_full.encode_to_vec();
    Ok(NetworkResult::Complete(result_bytes))
}

/// Queries the feed of events that the current user has liked
///
/// # Arguments
/// * `current_system_bytes` - Serialized PublicKey protobuf bytes representing the current system
/// * `limit` - Maximum number of events to return
/// * `latest_event_bytes` - Serialized Event bytes for the latest event from the previous page, or empty bytes for first page
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing Serialized InternalFeedResult bytes representing the result of this query
#[no_mangle]
pub extern "C" fn query_likes_feed(
    current_system_bytes: CBuffer,
    limit: u64,
    latest_event_bytes: CBuffer,
) -> CBuffer {
    let current_system_rust = match c_pointer_to_byte_array(current_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let latest_event_rust = match c_pointer_to_byte_array(latest_event_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_likes_feed_internal(current_system_rust, limit as usize, latest_event_rust) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_likes_feed_internal(
    system: &[u8],
    limit: usize,
    latest_event: &[u8],
) -> Result<NetworkResult, PlatformError> {
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

    let latest = decode_latest_event(latest_event)?;

    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let feed = engine
        .query_likes_feed(&system_key, limit, latest)
        .map_err(|e| PlatformError::QueryError(format!("Unable to query likes feed: {:?}", e)))?;

    let events_protobuf = Events { events: feed };

    let result_full = InternalFeedResult {
        result: Some(ResultAndServerErrors {
            result: events_protobuf.encode_to_vec(),
            errors: vec![],
        }),
        cursor: None,
    };

    Ok(NetworkResult::Complete(result_full.encode_to_vec()))
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
/// * `CBuffer` - Serialized protobuf Result containing serialized Events object
#[no_mangle]
pub extern "C" fn query_events(
    system_bytes: CBuffer,
    process_bytes: CBuffer,
    start_clock: u64,
    end_clock: u64,
) -> CBuffer {
    let system_bytes_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let process_bytes_rust = match c_pointer_to_byte_array(process_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_events_internal(
        system_bytes_rust,
        process_bytes_rust,
        start_clock,
        end_clock,
    ) {
        Ok(events) => protobuf_result_ok(events),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_events_internal(
    system_bytes: &[u8],
    process_bytes: &[u8],
    start_clock: u64,
    end_clock: u64,
) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;
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
        .map_err(|e| PlatformError::QueryError(format!("Query events failed: {}", e)))?;
    Ok(polycentric_common::models::event_array::serialize_signed_events(&result.events))
}

/// Helper method to query a system-specific CRDT without making any network requests
fn query_cached_crdt_for_system(
    system_bytes: &[u8],
    content_type: u64,
) -> Result<Option<LwwElement>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let content_type_enum = polycentric_common::models::protos::ContentType::try_from(
        content_type as i32,
    )
    .map_err(|_| {
        PlatformError::DeserializationError(format!("Invalid content type: {}", content_type))
    })?;

    engine
        .query_crdt_for_system(&system_key, content_type_enum)
        .map_err(|e| {
            PlatformError::QueryError(format!("Query CRDT for system failed: {}", e)).into()
        })
}

/// Helper method to query a system-specific CRDT from a specific server
fn query_server_crdt_for_system(
    target_system_bytes: &[u8],
    current_system_bytes: &[u8],
    content_type: u64,
    network_requests: &mut NetworkRequestResponses,
) -> Result<(), PlatformError> {
    let current_system_protobuf = PublicKey::from_bytes(current_system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!(
            "Unable to deserialize provided system public key: {:?}",
            e
        ))
    })?;

    let content_types_binary = RepeatedUInt64::encode_to_vec(&RepeatedUInt64 {
        numbers: vec![content_type],
    });

    let servers;
    {
        let engine_lock = get_engine_read_lock()?;
        let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
            "Polycentric core not initialized".to_owned(),
        ))?;

        servers = engine
            .query_servers_for_system(&SystemKey::from_public_key(&current_system_protobuf))
            .map_err(|e| PlatformError::QueryError(format!("Unable to query servers: {:?}", e)))?;
    }

    for server in servers {
        let mut get_query_latest_params = HashMap::new();
        get_query_latest_params.insert(
            "system".to_string(),
            BASE64_URL_SAFE_NO_PAD.encode(target_system_bytes),
        );
        get_query_latest_params.insert(
            "event_types".to_string(),
            BASE64_URL_SAFE_NO_PAD.encode(&content_types_binary[..]),
        );
        let get_query_latest_request = NetworkRequest {
            server: server.clone(),
            method: "GET".to_string(),
            endpoint: "query_latest".to_string(),
            parameters: get_query_latest_params,
            body: None,
        };
        let get_query_latest_response = get_response(&get_query_latest_request, network_requests);

        let response_value = match get_query_latest_response {
            None => continue,
            Some(value) => value,
        };

        let response_body = match response_value.body {
            None => continue,
            Some(value) => value,
        };

        let response_events = match Events::from_bytes(&response_body[..]) {
            Err(_err) => continue,
            Ok(evts) => evts,
        };

        for event in response_events.events {
            // If this throws an error, just ignore it and try another server
            let _ = ingest_event_internal(&event.encode_to_vec()[..]);
        }
    }

    Ok(())
}

fn query_crdt_for_system_internal(
    target_system_bytes: &[u8],
    content_type: u64,
    current_system_bytes: &[u8],
    network_requests: &[u8],
) -> Result<NetworkResult, PlatformError> {
    if let Some(value) = query_cached_crdt_for_system(target_system_bytes, content_type)? {
        // If we have a value cached, it's probably better to just use it rather than waiting for network requests
        let result = ProtobufOption {
            value: Some(value.encode_to_vec()),
        };
        return Ok(NetworkResult::Complete(result.encode_to_vec()));
    }

    let mut network_requests_protobuf =
        NetworkRequestResponses::decode(network_requests).map_err(|e| {
            PlatformError::DeserializationError(format!(
                "Unable to deserialize provided network requests: {:?}",
                e
            ))
        })?;

    query_server_crdt_for_system(
        target_system_bytes,
        current_system_bytes,
        content_type,
        &mut network_requests_protobuf,
    )?;

    if !is_complete(&network_requests_protobuf) {
        return Ok(NetworkResult::Incomplete(network_requests_protobuf));
    }

    let value = match query_cached_crdt_for_system(target_system_bytes, content_type)? {
        Some(crdt) => Some(crdt.encode_to_vec()),
        None => None,
    };

    Ok(NetworkResult::Complete(
        ProtobufOption { value }.encode_to_vec(),
    ))
}

/// Queries the value of a CRDT for a given system
/// # Arguments
/// * `target_system_bytes` - Serialized PublicKey bytes for system whose CRDT should be queried
/// * `content_type` - Content type of the CRDT to query
/// * `current_system_bytes` - Serialized PublicKey bytes for the current system
/// * `network_requests_bytes` - Serialized NetworkRequestResponses protobuf bytes representing prior network requests and responses
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing serialized protobuf Option containing serialized LwwElement protobuf bytes if any can be found
#[no_mangle]
pub extern "C" fn query_crdt_for_system(
    target_system_bytes: CBuffer,
    content_type: u64,
    current_system_bytes: CBuffer,
    network_requests_bytes: CBuffer,
) -> CBuffer {
    let target_system_rust = match c_pointer_to_byte_array(target_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let current_system_rust = match c_pointer_to_byte_array(current_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let network_requests_rust = match c_pointer_to_byte_array(network_requests_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_crdt_for_system_internal(
        target_system_rust,
        content_type,
        current_system_rust,
        network_requests_rust,
    ) {
        Ok(NetworkResult::Complete(events)) => protobuf_result_ok(events),
        Ok(NetworkResult::Incomplete(responses)) => protobuf_result_incomplete(responses),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

/// Query the current opinion for a target event by the current user's system
///
/// # Arguments
/// * `current_system_bytes` - Serialized system key bytes for the current user
/// * `target_pointer_bytes` - Serialized Pointer protobuf bytes for the target event
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing serialized protobuf Option containing LwwElement protobuf bytes or null if no opinion found
#[no_mangle]
pub extern "C" fn query_opinion(
    current_system_bytes: CBuffer,
    target_pointer_bytes: CBuffer,
) -> CBuffer {
    let current_system_bytes_rust = match c_pointer_to_byte_array(current_system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };
    let target_pointer_bytes_rust = match c_pointer_to_byte_array(target_pointer_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_opinion_internal(current_system_bytes_rust, target_pointer_bytes_rust) {
        Ok(events) => protobuf_result_ok(events),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_opinion_internal(
    current_system_bytes: &[u8],
    target_pointer_bytes: &[u8],
) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let current_system = engine.parse_system_key(current_system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse current system key: {}", e))
    })?;

    let target_pointer = Pointer::from_bytes(target_pointer_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse target pointer: {}", e))
    })?;

    match engine.query_opinion(&current_system, &target_pointer) {
        Ok(Some(lww_element)) => {
            let lww_element_bytes = lww_element.to_bytes().map_err(|e| {
                PlatformError::SerializationError(format!("Failed to serialize LwwElement: {}", e))
            })?;

            let bytes = ProtobufOption {
                value: Some(lww_element_bytes.encode_to_vec()),
            }
            .encode_to_vec();

            Ok(bytes)
        }
        Ok(None) => Ok(ProtobufOption { value: None }.encode_to_vec()),
        Err(e) => Err(PlatformError::QueryError(format!("Query opinion failed: {}", e)).into()),
    }
}

/// Query whether a given event has been deleted
///
/// # Arguments
/// * `pointer_bytes` - Pointer to the given event
///
/// # Returns
/// * `CBuffer` - Serialized protobuf Result containing a single byte: 1 if deleted, 0 if not deleted
#[no_mangle]
pub extern "C" fn query_event_is_deleted(pointer_bytes: CBuffer) -> CBuffer {
    let pointer_bytes_rust = match c_pointer_to_byte_array(pointer_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_event_is_deleted_internal(pointer_bytes_rust) {
        Ok(is_deleted) => protobuf_result_ok(if is_deleted { vec![1] } else { vec![0] }),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_event_is_deleted_internal(pointer_bytes: &[u8]) -> Result<bool, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let pointer = Pointer::decode(pointer_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to decode event pointer: {}", e))
    })?;

    let system = match pointer.system {
        Some(sys) => Ok(sys),
        None => Err(PlatformError::InvalidInput(
            "Event has no system".to_string(),
        )),
    }?;

    let process = match pointer.process {
        Some(proc) => Ok(proc),
        None => Err(PlatformError::InvalidInput(
            "Event has no process".to_string(),
        )),
    }?;

    let event_key = EventKey {
        system_key_type: system.key_type,
        system_key: system.key,
        process: process.process,
        logical_clock: pointer.logical_clock,
    };

    Ok(engine.query_is_deleted(&event_key))
}

/// Query follows for a system (LWW element set)
#[no_mangle]
pub extern "C" fn query_follows_for_system(system_bytes: CBuffer) -> CBuffer {
    let system_bytes_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_follows_for_system_internal(system_bytes_rust) {
        Ok(value) => protobuf_result_ok(value),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_follows_for_system_internal(system_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let signed_events = engine.get_lww_follows_for_system(&system_key);
    let events = Events {
        events: signed_events,
    };

    Ok(events.encode_to_vec())
}

/// Query blocks for a system (LWW element set)
#[no_mangle]
pub extern "C" fn query_blocks_for_system(system_bytes: CBuffer) -> CBuffer {
    let system_bytes_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_blocks_for_system_internal(system_bytes_rust) {
        Ok(value) => protobuf_result_ok(value),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_blocks_for_system_internal(system_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let signed_events = engine.get_lww_blocks_for_system(&system_key);
    let events = Events {
        events: signed_events,
    };

    Ok(events.encode_to_vec())
}

/// Query servers for a system (LWW element set)
#[no_mangle]
pub extern "C" fn query_servers_for_system(system_bytes: CBuffer) -> CBuffer {
    let system_bytes_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_servers_for_system_internal(system_bytes_rust) {
        Ok(value) => protobuf_result_ok(value),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_servers_for_system_internal(system_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let signed_events = engine.get_lww_servers_for_system(&system_key);
    let events = Events {
        events: signed_events,
    };

    Ok(events.encode_to_vec())
}

/// Query authorities for a system (LWW element set)
#[no_mangle]
pub extern "C" fn query_authorities_for_system(system_bytes: CBuffer) -> CBuffer {
    let system_bytes_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_authorities_for_system_internal(system_bytes_rust) {
        Ok(value) => protobuf_result_ok(value),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_authorities_for_system_internal(system_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let signed_events = engine.get_lww_authorities_for_system(&system_key);
    let events = Events {
        events: signed_events,
    };

    Ok(events.encode_to_vec())
}

/// Query topics for a system (LWW element set)
#[no_mangle]
pub extern "C" fn query_topics_for_system(system_bytes: CBuffer) -> CBuffer {
    let system_bytes_rust = match c_pointer_to_byte_array(system_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_topics_for_system_internal(system_bytes_rust) {
        Ok(value) => protobuf_result_ok(value),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_topics_for_system_internal(system_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let system_key = engine.parse_system_key(system_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let signed_events = engine.get_lww_topics_for_system(&system_key);
    let events = Events {
        events: signed_events,
    };

    Ok(events.encode_to_vec())
}

/// Query feed events for a system with cursor support for pagination
///
/// # Arguments
/// * `feed_query_bytes` - Serialized FeedQuery bytes
///
/// # Returns
/// * `CBuffer` - Serialized FeedResult protobuf bytes
#[no_mangle]
pub extern "C" fn query_feed_with_cursor(feed_query_bytes: CBuffer) -> CBuffer {
    let feed_query_bytes_rust = match c_pointer_to_byte_array(feed_query_bytes) {
        Some(result) => result,
        None => {
            return protobuf_result_err(
                PlatformError::FFIError("Bad pointer".to_owned()).to_string(),
            )
        }
    };

    match query_feed_with_cursor_internal(feed_query_bytes_rust) {
        Ok(value) => protobuf_result_ok(value),
        Err(err) => protobuf_result_err(err.to_string()),
    }
}

fn query_feed_with_cursor_internal(feed_query_bytes: &[u8]) -> Result<Vec<u8>, PlatformError> {
    let feed_query = FeedQuery::decode(feed_query_bytes).map_err(|e| {
        PlatformError::DeserializationError(format!("Failed to parse system key: {}", e))
    })?;

    let engine_lock = get_engine_read_lock()?;
    let engine = engine_lock.as_ref().ok_or(PlatformError::InvalidState(
        "Polycentric core not initialized".to_owned(),
    ))?;

    let cursor_bytes = feed_query.cursor.map(|c| c.to_vec());
    let limit: Option<usize> = match feed_query.limit {
        Some(lim) => Some(lim.try_into().map_err(|_e| {
            PlatformError::InvalidInput("Limit argument does not fit into a rust usize".to_string())
        })?),
        None => None,
    };

    let result = engine
        .query_feed_with_cursor(
            &feed_query.system_bytes[..],
            feed_query.start_time,
            feed_query.end_time,
            limit,
            cursor_bytes.as_deref(),
        )
        .map_err(|e| PlatformError::QueryError(format!("Query feed failed: {}", e)))?;

    Ok(result)
}
