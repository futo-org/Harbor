//! `search_posts`: searches posts.

use crate::service::context::ServiceContext;
use crate::service::proto::{SearchPostsRequest, SearchPostsResponse};
use tonic::Status;

#[allow(unused_variables)] // TODO: remove.
pub async fn handle(
    ctx: &ServiceContext,
    req: SearchPostsRequest,
) -> Result<SearchPostsResponse, Status> {
    Err(Status::unimplemented(
        "searching of posts is currently not implemented",
    ))
}
