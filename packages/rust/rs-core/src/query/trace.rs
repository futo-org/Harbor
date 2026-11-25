//! W3C `traceparent` for outgoing gRPC requests.

use std::sync::RwLock;

use tonic::metadata::AsciiMetadataValue;

use crate::lock::RwLockRecover;

static ACTION: RwLock<Option<AsciiMetadataValue>> = RwLock::new(None);

/// Set the `traceparent` to stamp on requests, or `None` to generate one per request.
pub fn set_traceparent(traceparent: Option<String>) -> Result<(), String> {
    let value = match traceparent {
        Some(value) if is_traceparent(&value) => Some(
            value
                .parse()
                .map_err(|_| "traceparent is not a valid header value".to_string())?,
        ),
        Some(_) => return Err("traceparent must be 00-<32 hex>-<16 hex>-<2 hex>".to_string()),
        None => None,
    };
    *ACTION.write_recover() = value;
    Ok(())
}

/// The `traceparent` for the next request.
pub fn traceparent() -> Option<AsciiMetadataValue> {
    if let Some(action) = ACTION.read_recover().clone() {
        return Some(action);
    }
    let mut ids = [0u8; 24];
    fill_random(&mut ids)?;
    let (trace_id, span_id) = ids.split_at(16);
    if trace_id.iter().all(|b| *b == 0) || span_id.iter().all(|b| *b == 0) {
        return None;
    }
    format!("00-{}-{}-01", hex::encode(trace_id), hex::encode(span_id))
        .parse()
        .ok()
}

fn is_traceparent(value: &str) -> bool {
    let hex = |s: &str, len: usize| {
        s.len() == len
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            && s.bytes().any(|b| b != b'0')
    };
    let parts: Vec<&str> = value.split('-').collect();
    parts.len() == 4
        && parts[0] == "00"
        && hex(parts[1], 32)
        && hex(parts[2], 16)
        && parts[3].len() == 2
        && parts[3].bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(not(target_arch = "wasm32"))]
fn fill_random(buf: &mut [u8]) -> Option<()> {
    getrandom::fill(buf).ok()
}

#[cfg(target_arch = "wasm32")]
fn fill_random(buf: &mut [u8]) -> Option<()> {
    for byte in buf.iter_mut() {
        *byte = (js_sys::Math::random() * 256.0) as u8;
    }
    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn next() -> String {
        traceparent().unwrap().to_str().unwrap().to_string()
    }

    // One test: the stored value is global.
    #[test]
    fn stamps_the_open_action_or_a_fresh_trace() {
        let first = next();
        let second = next();
        assert_eq!(first.len(), 55);
        assert!(first.starts_with("00-") && first.ends_with("-01"));
        assert!(
            first[3..]
                .bytes()
                .all(|b| b.is_ascii_hexdigit() || b == b'-')
        );
        assert_ne!(first[3..35], second[3..35]);

        let action = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
        set_traceparent(Some(action.to_string())).unwrap();
        assert_eq!(next(), action);
        assert_eq!(next(), action);

        set_traceparent(None).unwrap();
        assert_ne!(next(), action);
    }

    #[test]
    fn rejects_malformed_traceparents() {
        for bad in [
            "",
            "garbage",
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331",
            "01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
            "00-00000000000000000000000000000000-b7ad6b7169203331-01",
            "00-0AF7651916CD43DD8448EB211C80319C-b7ad6b7169203331-01",
        ] {
            assert!(set_traceparent(Some(bad.to_string())).is_err(), "{bad}");
        }
    }
}
