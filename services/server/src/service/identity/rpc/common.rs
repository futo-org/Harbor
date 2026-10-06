//! Helpers shared across the moderation RPC handlers.

use tonic::{Request, Status};

use crate::config;
use crate::service::auth::authenticated_identity;
use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;

/// Rejects unless the request is authenticated as a moderator on this
/// server, returning the moderator's identity. Unauthenticated requests
/// are rejected as `Unauthenticated`; authenticated non-moderators as
/// `PermissionDenied`.
pub async fn require_moderator<T>(
    ctx: &ServiceContext,
    request: &Request<T>,
) -> Result<String, Status> {
    let identity = authenticated_identity(request)
        .ok_or_else(|| Status::unauthenticated("authentication required"))?;
    if let Some(trusted_moderator) = config::get().trusted_moderator.as_deref()
        && identity == trusted_moderator
    {
        return Ok(identity);
    }
    let is_moderator = id_repo::Query::is_moderator(&ctx.ro_db, &identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;
    if !is_moderator {
        return Err(Status::permission_denied("not a moderator"));
    }
    Ok(identity)
}
