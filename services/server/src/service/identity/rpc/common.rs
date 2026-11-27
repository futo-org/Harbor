//! Helpers shared across the moderation RPC handlers.

use tonic::Status;

use crate::config;
use crate::service::context::{Auth, RequestContext};
use crate::service::identity::repository as id_repo;

/// Rejects unless the request is authenticated as a moderator on this
/// server, returning the moderator's identity. Unauthenticated requests
/// are rejected as `Unauthenticated`; authenticated non-moderators as
/// `PermissionDenied`.
pub(crate) async fn require_moderator<A: Auth>(
    ctx: &mut RequestContext<A>,
) -> Result<(), Status> {
    let Some(identity) = ctx.auth.identity() else {
        return Err(Status::permission_denied("not a moderator"));
    };
    if let Some(trusted_moderator) = config::get().trusted_moderator.as_deref()
        && identity == trusted_moderator
    {
        return Ok(());
    }
    let is_moderator = id_repo::Query::is_moderator(&mut ctx.db, identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;
    if !is_moderator {
        return Err(Status::permission_denied("not a moderator"));
    }
    Ok(())
}
