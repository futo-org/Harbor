//! Small helpers shared across the feeds handlers.

use crate::service::proto::PageParams;
use sea_orm::DbErr;
use tonic::Status;

pub fn page_limit(page_params: &Option<PageParams>) -> u64 {
    page_params
        .as_ref()
        .and_then(|p| p.limit)
        .unwrap_or(50)
        .clamp(1, 200) as u64
}

pub fn map_db_err(e: DbErr) -> Status {
    tracing::error!(error = %e, "feeds_service db error");
    Status::internal("internal server error")
}
