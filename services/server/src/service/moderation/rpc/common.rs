use tonic::Status;

use crate::service::proto::{EventKey, PageInfo, PublicKey};

pub const DEFAULT_LIMIT: i32 = 10;
pub const MAX_LIMIT: i32 = 100;

pub fn page_limit(limit: Option<i32>) -> u64 {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT) as u64
}

/// Cursors are the decimal `events.id` of the page's last row.
pub fn decode_cursor(after: Option<&str>) -> Result<Option<i64>, Status> {
    match after {
        None | Some("") => Ok(None),
        Some(cursor) => cursor
            .parse()
            .map(Some)
            .map_err(|_| Status::invalid_argument("invalid cursor")),
    }
}

pub fn page_info(
    first: Option<i64>,
    last: Option<i64>,
    has_previous_page: bool,
    has_next_page: bool,
) -> PageInfo {
    PageInfo {
        start_cursor: first.map(|c| c.to_string()).unwrap_or_default(),
        end_cursor: last.map(|c| c.to_string()).unwrap_or_default(),
        has_previous_page,
        has_next_page,
    }
}

pub fn event_key(
    collection: i16,
    identity: &str,
    public_key_type: i16,
    public_key: &[u8],
    sequence: i64,
) -> EventKey {
    EventKey {
        collection: collection as i32,
        identity: identity.to_string(),
        signed_by: Some(PublicKey {
            key_type: public_key_type as i32,
            key: public_key.to_vec(),
        }),
        sequence: sequence as u64,
    }
}
