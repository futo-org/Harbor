//! `delete_identity`: deletes the currently authenticated identity.
//! Requires the caller to be authentication (in case that wasn't clear).

use ::entity::identity_audit_log;
use tonic::Status;

use crate::service::context::{AuthenticatedIdentity, RequestContext};
use crate::service::identity::repository;
use crate::service::proto::{DeleteIdentityRequest, DeleteIdentityResponse};

pub async fn handle(
    mut ctx: RequestContext<AuthenticatedIdentity>,
    _: DeleteIdentityRequest,
) -> Result<DeleteIdentityResponse, Status> {
    let identity = ctx.auth.identity.clone();

    let mut tx = ctx.db.begin().await.map_err(|error| {
        tracing::error!(%error, %identity, "failed to begin transaction to delete identity");
        Status::internal("internal server error")
    })?;

    repository::Mutation::delete_identity(&mut tx, &identity)
        .await
        .map_err(|error| {
            tracing::error!(%error, %identity, "failed to delete identity");
            Status::internal("internal server error")
        })?;

    repository::Mutation::audit_action(
        &mut tx,
        ctx.auth.identity.clone(),
        identity_audit_log::Action::Deleted,
        repository::PerformedBy::Identity {
            identity: ctx.auth.identity,
            public_key: ctx.auth.public_key.to_string(),
        },
    )
    .await
    .map_err(|error| {
        tracing::error!(%error, %identity, "failed to record deletion of identity");
        Status::internal("internal server error")
    })?;

    tx.commit().await.map_err(|error| {
        tracing::error!(%error, %identity, "failed to commit transaction to delete identity");
        Status::internal("internal server error")
    })?;

    ctx.proof_cache.invalidate_identity(&identity).await;

    Ok(DeleteIdentityResponse {})
}
