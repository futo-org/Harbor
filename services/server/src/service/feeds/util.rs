//! Small helpers shared across the feeds handlers.

use crate::service::proto::{self, PageParams};
use base64::prelude::*;
use sea_orm::DbErr;
use serde::{Deserialize, Serialize};
use tonic::Status;

pub fn page_limit(page_params: &Option<PageParams>) -> u64 {
    page_params
        .as_ref()
        .and_then(|p| p.limit)
        .unwrap_or(50)
        .clamp(1, 200) as u64
}

pub fn map_db_err(e: DbErr) -> Status {
    eprintln!("feeds_service db error: {e}");
    Status::internal("internal server error")
}

/// An opaque token that can be used with clients for pagination.
/// No guarantees to clients that the format will remain stable nor
/// regarding compatibility across servers.
///
/// A cursor is only expected to aid in finding data already present
/// when the first cursor in a chain is created.
/// Client should "refresh" by querying again without providing a cursor
/// when fresh data is required.
/// Otherwise, fresh data may or may not be included.
pub trait PageCursor: Serialize + for<'de> Deserialize<'de> {
    fn encode(&self) -> Result<String, Status> {
        let bytes = serde_json::to_vec(self).map_err(|e| {
            eprintln!("encode pagination token: {e}");
            Status::internal("internal server error")
        })?;

        let encoded = BASE64_STANDARD.encode(bytes);
        Ok(encoded)
    }

    fn decode(token: &str) -> Result<Self, Status> {
        let bytes = BASE64_STANDARD.decode(token).map_err(|e| {
            eprintln!("decode pagination token: {e}");
            Status::invalid_argument("pagination token")
        })?;

        serde_json::from_slice(bytes.as_slice()).map_err(|e| {
            eprintln!("decode pagination token: {e}");
            Status::invalid_argument("pagination token")
        })
    }
}

/// `PageInfo` to return to the client, except with our types
/// instead of opaque cursor strings.
pub struct PageInfo<Cursor: PageCursor> {
    pub backward_cursor: Cursor,
    pub forward_cursor: Cursor,
    pub has_previous_page: bool,
    pub has_next_page: bool,
}

impl<T: PageCursor> PageInfo<T> {
    /// Build the final `PageInfo` protobuf message to give the client.
    pub fn proto(&self) -> Result<proto::PageInfo, Status> {
        let start_cursor = self.backward_cursor.encode()?;
        let end_cursor = self.forward_cursor.encode()?;

        let output = proto::PageInfo {
            start_cursor,
            end_cursor,
            has_previous_page: self.has_previous_page,
            has_next_page: self.has_next_page,
        };

        Ok(output)
    }
}
