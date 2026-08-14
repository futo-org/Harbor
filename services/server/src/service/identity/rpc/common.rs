//! Helpers shared across the moderation RPC handlers.

use crate::service::auth::AuthenticatedIdentity;
use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use tonic::{Request, Status};

/// The identity the request is authenticated as, or `None` when it
/// arrived without a verified auth token. Populated by `auth_middleware`
/// from the bearer JWT and carried through as a request extension.
pub fn authenticated_identity<T>(request: &Request<T>) -> Option<String> {
    request
        .extensions()
        .get::<AuthenticatedIdentity>()
        .map(|AuthenticatedIdentity(identity)| identity.clone())
}

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
    let is_moderator =
        id_repo::Query::is_moderator(&ctx.db, &identity)
            .await
            .map_err(|_| Status::internal("internal server error"))?;
    if !is_moderator {
        return Err(Status::permission_denied("not a moderator"));
    }
    Ok(identity)
}
