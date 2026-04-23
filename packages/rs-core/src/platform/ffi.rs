use crate::client::PolycentricClient;
use polycentric_common::models::protos_v2::{ContentDigest, Event, PublicKey, SignedEvent};
use polycentric_common::models::traits::Serializable;
use prost::Message;
use std::slice;
use std::sync::{OnceLock, RwLock};

/// CResult is the FFI type shared with C++ for returning data or errors.
/// success=true: bytes/length contain result data
/// success=false: bytes/length contain UTF-8 error message
#[repr(C)]
pub struct CResult {
    pub success: bool,
    pub bytes: *const u8,
    pub length: u32,
}

impl CResult {
    fn ok(v: Vec<u8>) -> CResult {
        let len = v.len() as u32;
        let ptr = v.as_ptr();
        std::mem::forget(v);
        CResult {
            success: true,
            bytes: ptr,
            length: len,
        }
    }

    fn error(msg: &str) -> CResult {
        let bytes = msg.as_bytes().to_vec();
        let len = bytes.len() as u32;
        let ptr = bytes.as_ptr();
        std::mem::forget(bytes);
        CResult {
            success: false,
            bytes: ptr,
            length: len,
        }
    }

    fn as_slice(&self) -> &[u8] {
        if self.bytes.is_null() || self.length == 0 {
            return &[];
        }
        unsafe { slice::from_raw_parts(self.bytes, self.length as usize) }
    }
}

/// Free a CResult allocated by Rust.
#[no_mangle]
pub extern "C" fn free_result(result: CResult) {
    if !result.bytes.is_null() && result.length > 0 {
        unsafe {
            drop(Vec::from_raw_parts(
                result.bytes as *mut u8,
                result.length as usize,
                result.length as usize,
            ));
        }
    }
}

fn client() -> &'static RwLock<PolycentricClient> {
    static CLIENT: OnceLock<RwLock<PolycentricClient>> = OnceLock::new();
    CLIENT.get_or_init(|| RwLock::new(PolycentricClient::new()))
}

/// Verify a v2 SignedEvent's ed25519 signature and return the verified
/// SignedEvent bytes.
#[no_mangle]
pub extern "C" fn verify_signed_event(signed_event_bytes: CResult) -> CResult {
    match SignedEvent::from_bytes(signed_event_bytes.as_slice()) {
        Ok(verified) => match Serializable::to_bytes(&verified) {
            Ok(bytes) => CResult::ok(bytes),
            Err(e) => CResult::error(&format!("Failed to encode: {e}")),
        },
        Err(e) => CResult::error(&format!("Verification failed: {e}")),
    }
}

/// Decode the Event from a v2 SignedEvent's event_bytes field.
#[no_mangle]
pub extern "C" fn decode_event_from_signed_event(signed_event_bytes: CResult) -> CResult {
    match SignedEvent::decode(signed_event_bytes.as_slice()) {
        Ok(signed_event) => match Event::decode(signed_event.event_bytes.as_slice()) {
            Ok(event) => CResult::ok(Message::encode_to_vec(&event)),
            Err(e) => CResult::error(&format!("Failed to decode event: {e}")),
        },
        Err(e) => CResult::error(&format!("Failed to decode signed event: {e}")),
    }
}

/// Validate that bytes are a valid v2 Event. Returns the bytes unchanged on
/// success, or an error.
#[no_mangle]
pub extern "C" fn validate_event(event_bytes: CResult) -> CResult {
    let input = event_bytes.as_slice();
    match Event::decode(input) {
        Ok(_) => CResult::ok(input.to_vec()),
        Err(e) => CResult::error(&format!("Invalid event bytes: {e}")),
    }
}

#[no_mangle]
pub extern "C" fn next_sequence(identity: CResult, collection: i32, signed_by: CResult) -> CResult {
    let identity_str = match std::str::from_utf8(identity.as_slice()) {
        Ok(s) => s,
        Err(e) => return CResult::error(&format!("identity not utf-8: {e}")),
    };
    let pk = match PublicKey::decode(signed_by.as_slice()) {
        Ok(p) => p,
        Err(e) => return CResult::error(&format!("decode signed_by: {e}")),
    };
    let c = match client().read() {
        Ok(c) => c,
        Err(e) => return CResult::error(&format!("lock poisoned: {e}")),
    };
    let seq = c.next_sequence(identity_str, collection, pk.key_type, &pk.key);
    CResult::ok(seq.to_le_bytes().to_vec())
}

#[no_mangle]
pub extern "C" fn build_vector_clock(
    identity: CResult,
    collection: i32,
    identity_sequence: u64,
    signed_by: CResult,
    current_sequence: u64,
) -> CResult {
    let identity_str = match std::str::from_utf8(identity.as_slice()) {
        Ok(s) => s,
        Err(e) => return CResult::error(&format!("identity not utf-8: {e}")),
    };
    let pk = match PublicKey::decode(signed_by.as_slice()) {
        Ok(p) => p,
        Err(e) => return CResult::error(&format!("decode signed_by: {e}")),
    };
    let c = match client().read() {
        Ok(c) => c,
        Err(e) => return CResult::error(&format!("lock poisoned: {e}")),
    };
    match c.build_vector_clock(
        identity_str,
        collection,
        identity_sequence,
        &pk,
        current_sequence,
    ) {
        Ok(clock) => CResult::ok(clock.encode_to_vec()),
        Err(e) => CResult::error(&format!("build_vector_clock: {e}")),
    }
}

#[no_mangle]
pub extern "C" fn copy_event(signed_event_bytes: CResult) -> CResult {
    let signed_event = match SignedEvent::from_bytes(signed_event_bytes.as_slice()) {
        Ok(s) => s,
        Err(e) => return CResult::error(&format!("invalid signed event: {e}")),
    };
    let mut c = match client().write() {
        Ok(c) => c,
        Err(e) => return CResult::error(&format!("lock poisoned: {e}")),
    };
    match c.copy_event(signed_event) {
        Ok(_) => CResult::ok(Vec::new()),
        Err(e) => CResult::error(&format!("copy_event: {e}")),
    }
}

#[no_mangle]
pub extern "C" fn copy_content(digest_bytes: CResult, content_bytes: CResult) -> CResult {
    let digest = match ContentDigest::decode(digest_bytes.as_slice()) {
        Ok(d) => d,
        Err(e) => return CResult::error(&format!("decode ContentDigest: {e}")),
    };
    let mut c = match client().write() {
        Ok(c) => c,
        Err(e) => return CResult::error(&format!("lock poisoned: {e}")),
    };
    c.copy_content(&digest, content_bytes.as_slice().to_vec());
    CResult::ok(Vec::new())
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
