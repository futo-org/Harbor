//! `search_users`: searches users.

use crate::service::context::ServiceContext;
use crate::service::proto::{SearchUsersRequest, SearchUsersResponse};
use crate::service::search::repository::Query;
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    req: SearchUsersRequest,
) -> Result<SearchUsersResponse, Status> {
    let event_bundles =
        Query::search_users(&ctx.db, &req).await.map_err(|err| {
            log::warn!("failed to search for users: {err}");
            Status::internal("internal server error")
        })?;

    Ok(SearchUsersResponse {
        event_bundles,
        // TODO.
        page_info: None,
        event_hints: Vec::new(),
    })
}
