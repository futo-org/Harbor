//! Small helpers shared across the feeds handlers.

use crate::service::proto::PageParams;
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
