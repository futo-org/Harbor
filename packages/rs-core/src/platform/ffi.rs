use polycentric_common::models::protos_v2::{Event, SignedEvent};
use polycentric_common::models::traits::Serializable;
use prost::Message;
use std::slice;

/// CBuffer is the FFI type shared with C++ for passing byte arrays.
/// Positive length = success data, negative length = error string.
#[repr(C)]
pub struct CBuffer {
    pub bytes: *const u8,
    pub length: i32,
}

impl CBuffer {
    fn as_slice(&self) -> &[u8] {
        if self.length <= 0 || self.bytes.is_null() {
            return &[];
        }
        unsafe { slice::from_raw_parts(self.bytes, self.length as usize) }
    }

    fn from_vec(v: Vec<u8>) -> CBuffer {
        let len = v.len() as i32;
        let ptr = v.as_ptr();
        std::mem::forget(v);
        CBuffer {
            bytes: ptr,
            length: len,
        }
    }

    fn error(msg: &str) -> CBuffer {
        let bytes = msg.as_bytes().to_vec();
        let len = -(bytes.len() as i32);
        let ptr = bytes.as_ptr();
        std::mem::forget(bytes);
        CBuffer {
            bytes: ptr,
            length: len,
        }
    }
}

/// Free a CBuffer allocated by Rust.
#[no_mangle]
pub extern "C" fn free_bytes(buf: CBuffer) {
    if !buf.bytes.is_null() && buf.length != 0 {
        let len = buf.length.unsigned_abs() as usize;
        unsafe {
            drop(Vec::from_raw_parts(buf.bytes as *mut u8, len, len));
        }
    }
}

/// Verify a v2 SignedEvent's ed25519 signature and return the verified
/// SignedEvent bytes.
#[no_mangle]
pub extern "C" fn verify_signed_event_v2(signed_event_bytes: CBuffer) -> CBuffer {
    let input = signed_event_bytes.as_slice();
    match SignedEvent::from_bytes(input) {
        Ok(verified) => match Serializable::to_bytes(&verified) {
            Ok(bytes) => CBuffer::from_vec(bytes),
            Err(e) => CBuffer::error(&format!("Failed to encode: {e}")),
        },
        Err(e) => CBuffer::error(&format!("Verification failed: {e}")),
    }
}

/// Decode the Event from a v2 SignedEvent's event_bytes field.
#[no_mangle]
pub extern "C" fn decode_event_from_signed_event_v2(signed_event_bytes: CBuffer) -> CBuffer {
    let input = signed_event_bytes.as_slice();
    match SignedEvent::decode(input) {
        Ok(signed_event) => match Event::decode(signed_event.event_bytes.as_slice()) {
            Ok(event) => CBuffer::from_vec(Message::encode_to_vec(&event)),
            Err(e) => CBuffer::error(&format!("Failed to decode event: {e}")),
        },
        Err(e) => CBuffer::error(&format!("Failed to decode signed event: {e}")),
    }
}

/// Validate that bytes are a valid v2 Event. Returns the bytes unchanged on
/// success, or an error.
#[no_mangle]
pub extern "C" fn validate_event_v2(event_bytes: CBuffer) -> CBuffer {
    let input = event_bytes.as_slice();
    match Event::decode(input) {
        Ok(_) => CBuffer::from_vec(input.to_vec()),
        Err(e) => CBuffer::error(&format!("Invalid event bytes: {e}")),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
