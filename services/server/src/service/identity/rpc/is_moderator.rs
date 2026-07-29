//! `is_moderator`: returns whether the calling identity is a moderator on
//! this server.
//!
//! UNPROTECTED: the request-signing auth that identified the caller has
//! been removed, so there is no caller identity to check yet. Until a new
//! auth layer supplies the authenticated identity, this fails closed.
//! TODO(auth): resolve the caller from the new auth layer and check it.

use crate::service::context::ServiceContext;
use crate::service::proto::{IsModeratorRequest, IsModeratorResponse};
use tonic::{Request, Status};

pub async fn handle(
    _ctx: &ServiceContext,
    _request: Request<IsModeratorRequest>,
) -> Result<IsModeratorResponse, Status> {
    Ok(IsModeratorResponse {
        is_moderator: false,
    })
}
