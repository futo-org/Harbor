//! Multi-server pagination helpers: aggregate per-server cursor tokens
//! into a single opaque token and merge per-server page info.

use std::collections::BTreeMap;

use base64::prelude::*;
use polycentric_common::error::CoreError;
use polycentric_common::models::protos_v2::PageInfo;
use serde::{Deserialize, Serialize};

use crate::logging::log_warn;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FakeCursorToken {
    /// Maps server url -> real cursor information
    pub map: BTreeMap<String, CursorInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CursorInfo {
    /// The opaque cursor token provided by the server.
    token: String,
    /// How many queries forward (positive) or backward (negative) we are from the original
    /// un-cursored query.
    offset: i32,
    /// has_next_page or has_previous_page, depending on `offset`'s value.
    more_data: bool,
}

/// Our responses to js-core need to contain data aggregated from multiple servers,
/// but "look like" a single server response.
/// Easy enough for lists of events, but the opaque tokens need to be faked as
/// an aggregate opaque token.
impl FakeCursorToken {
    pub fn encode(&self) -> Result<String, CoreError> {
        let bytes = serde_json::to_vec(self).map_err(|e| {
            CoreError::SerializationError(format!("Faking cursor token failed: {e}"))
        })?;

        let encoded = BASE64_STANDARD.encode(bytes);
        Ok(encoded)
    }

    pub fn decode(token: &str) -> Result<Self, CoreError> {
        let bytes = BASE64_STANDARD
            .decode(token)
            .map_err(|e| CoreError::DeserializationError(format!("Invalid fake cursor: {e}")))?;

        serde_json::from_slice(bytes.as_slice())
            .map_err(|e| CoreError::DeserializationError(format!("Invalid fake cursor: {e}")))
    }

    pub fn extend(&mut self, other: FakeCursorToken) {
        self.map.extend(other.map);
    }

    /// Create a fake cursor from a real one and some metadata.
    pub fn new(server: String, info: CursorInfo) -> Self {
        let mut fake = Self::default();
        fake.map.insert(server, info);
        fake
    }

    /// Create an encoded fake cursor from a real one and some metadata.
    pub fn encode_new(
        server: &str,
        token: &str,
        offset: i32,
        more_data: bool,
    ) -> Result<String, String> {
        FakeCursorToken::new(
            server.to_string(),
            CursorInfo {
                token: token.to_string(),
                offset,
                more_data,
            },
        )
        .encode()
        .map_err(|e| e.to_string())
    }

    /// Get the data needed for performing a remote query.
    /// Returns the token to send and the cursor's offset.
    pub fn extract(fake_token: &Option<String>, server: &str) -> (Option<String>, i32) {
        fake_token
            .as_ref()
            .and_then(|t| Self::decode(t).ok())
            .and_then(|mut fake| fake.map.remove(server))
            .map(|info| (Some(info.token), info.offset))
            .unwrap_or((None, 0))
    }

    /// True when the token names other servers but not `server`, meaning
    /// it missed the fan-out the token came from.
    pub fn excludes(fake_token: &Option<String>, server: &str) -> bool {
        fake_token
            .as_ref()
            .and_then(|t| Self::decode(t).ok())
            .is_some_and(|fake| !fake.map.is_empty() && !fake.map.contains_key(server))
    }

    /// The server this token belongs to, when it holds exactly one.
    pub fn sole_server(&self) -> Option<&str> {
        if self.map.len() == 1 {
            self.map.keys().next().map(String::as_str)
        } else {
            None
        }
    }
}

/// The oldest timestamp every server with more data has paged past.
/// Items below it may still be preceded by a later page, so merges hold
/// them back. `None` when no server has more data.
pub fn pagination_horizon(
    oldest_by_server: &BTreeMap<String, u64>,
    merged_end_cursor: &str,
) -> Option<u64> {
    let token = FakeCursorToken::decode(merged_end_cursor).ok()?;
    token
        .map
        .iter()
        .filter(|(_, info)| info.more_data)
        .filter_map(|(server, _)| oldest_by_server.get(server).copied())
        .max()
}

/// Empty map
impl Default for FakeCursorToken {
    fn default() -> Self {
        Self {
            map: BTreeMap::new(),
        }
    }
}

/// Replace the server's cursor tokens with fake aggregate ones so the
/// response can be merged with other servers' responses.
pub fn prepare_page_info(
    page_info: &mut Option<PageInfo>,
    server_url: &str,
    backward_offset: i32,
    forward_offset: i32,
) -> Result<(), String> {
    if let Some(i) = page_info.as_mut() {
        i.start_cursor = FakeCursorToken::encode_new(
            server_url,
            &i.start_cursor,
            backward_offset - 1,
            i.has_previous_page,
        )?;

        i.end_cursor = FakeCursorToken::encode_new(
            server_url,
            &i.end_cursor,
            forward_offset + 1,
            i.has_next_page,
        )?;
    }

    Ok(())
}

/// Expects two encoded fake cursors as input.
/// Returns (encoded fake cursor, more_data).
/// Defaults to the first cursor and false if an error occurs.
fn merge_cursors(t1: String, t2: String) -> (String, bool) {
    let mut merged = FakeCursorToken::default();

    let Ok(c1) = FakeCursorToken::decode(&t1) else {
        log_warn(|| String::from("Unable to decode fake cursor!"));
        return (t1, false);
    };

    let Ok(mut c2) = FakeCursorToken::decode(&t2) else {
        log_warn(|| String::from("Unable to decode fake cursor!"));
        return (t1, false);
    };

    // Add any server cursors in c1, taking the latest when c2 also has a
    // cursor from this server.
    c1.map.into_iter().for_each(|(server, info)| {
        if let Some(other) = c2.map.remove(&server) {
            // If the offsets are opposite in sign, then a forward cursor is
            // being compared against a backward cursor.
            debug_assert!(
                (info.offset >= 0 && other.offset >= 0) || (info.offset <= 0 && other.offset <= 0)
            );

            let new_info = if info.offset.abs() >= other.offset.abs() {
                info
            } else {
                other
            };

            merged.map.insert(server, new_info);
        } else {
            merged.map.insert(server, info);
        }
    });

    // Add in any cursors in stil in c2
    merged.map.extend(c2.map);

    let more_data = merged.map.values().any(|info| info.more_data);

    (merged.encode().unwrap_or(t1), more_data)
}

pub fn merge_page_info(i1: Option<PageInfo>, i2: Option<PageInfo>) -> Option<PageInfo> {
    match (i1, i2) {
        (None, None) => None,
        (Some(i), None) => Some(i),
        (None, Some(i)) => Some(i),
        (Some(i1), Some(i2)) => {
            let (start_cursor, has_previous_page) = merge_cursors(i1.start_cursor, i2.start_cursor);
            let (end_cursor, has_next_page) = merge_cursors(i1.end_cursor, i2.end_cursor);

            Some(PageInfo {
                start_cursor,
                end_cursor,
                has_previous_page,
                has_next_page,
            })
        }
    }
}

#[cfg(test)]
mod cursor_tests {
    use super::*;

    #[test]
    fn fake_cursor_roundtrip_extracts_per_server() {
        let token = FakeCursorToken::encode_new("server-a", "real-token", 1, true).unwrap();

        let (extracted, offset) = FakeCursorToken::extract(&Some(token.clone()), "server-a");
        assert_eq!(extracted.as_deref(), Some("real-token"));
        assert_eq!(offset, 1);

        // A server not present in the aggregate starts from scratch.
        let (extracted, offset) = FakeCursorToken::extract(&Some(token), "server-b");
        assert_eq!(extracted, None);
        assert_eq!(offset, 0);
    }

    #[test]
    fn extract_without_a_token_is_empty() {
        let (extracted, offset) = FakeCursorToken::extract(&None, "server-a");
        assert_eq!(extracted, None);
        assert_eq!(offset, 0);
    }

    fn faked_page_info(server: &str, has_next_page: bool) -> PageInfo {
        PageInfo {
            start_cursor: FakeCursorToken::encode_new(server, "start", -1, false).unwrap(),
            end_cursor: FakeCursorToken::encode_new(server, "end", 1, has_next_page).unwrap(),
            has_previous_page: false,
            has_next_page,
        }
    }

    #[test]
    fn merged_page_info_combines_servers() {
        let merged = merge_page_info(
            Some(faked_page_info("server-a", true)),
            Some(faked_page_info("server-b", false)),
        )
        .unwrap();

        // Any server with more data leaves the merged page open.
        assert!(merged.has_next_page);

        // Both servers' real cursors survive inside the aggregate.
        let (token_a, _) = FakeCursorToken::extract(&Some(merged.end_cursor.clone()), "server-a");
        let (token_b, _) = FakeCursorToken::extract(&Some(merged.end_cursor), "server-b");
        assert_eq!(token_a.as_deref(), Some("end"));
        assert_eq!(token_b.as_deref(), Some("end"));
    }

    #[test]
    fn merged_page_info_keeps_the_farthest_cursor_per_server() {
        let near = PageInfo {
            start_cursor: FakeCursorToken::encode_new("s", "start-1", -1, false).unwrap(),
            end_cursor: FakeCursorToken::encode_new("s", "end-1", 1, true).unwrap(),
            has_previous_page: false,
            has_next_page: true,
        };
        let far = PageInfo {
            start_cursor: FakeCursorToken::encode_new("s", "start-2", -2, false).unwrap(),
            end_cursor: FakeCursorToken::encode_new("s", "end-2", 2, false).unwrap(),
            has_previous_page: false,
            has_next_page: false,
        };

        let merged = merge_page_info(Some(near), Some(far)).unwrap();
        let (token, offset) = FakeCursorToken::extract(&Some(merged.end_cursor), "s");
        assert_eq!(token.as_deref(), Some("end-2"));
        assert_eq!(offset, 2);
    }
}
