//! `delete_content`: erases one event from this server and resolves the
//! reports on it.

use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::events::TargetEventKey;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::identity::service::erase_event;
use crate::service::moderation::repository;
use crate::service::proto::{DeleteContentRequest, DeleteContentResponse};

pub async fn handle(
    mut ctx: AuthContext,
    req: DeleteContentRequest,
) -> Result<DeleteContentResponse, Status> {
    require_moderator(&ctx).await?;

    let Some(target) = req.target else {
        return Err(Status::invalid_argument("target is required"));
    };
    let Some(signed_by) = target.signed_by.as_ref() else {
        return Err(Status::invalid_argument("target signer is required"));
    };
    let key = TargetEventKey {
        collection: target.collection as i16,
        identity: target.identity.clone(),
        public_key_type: signed_by.key_type as i16,
        public_key: signed_by.key.clone(),
        sequence: target.sequence as i64,
    };

    let erased = erase_event(&mut ctx.db, Some(&ctx.proof_cache), &key)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "delete_content erase error");
            Status::internal("internal server error")
        })?;
    repository::Mutation::resolve_reports_on_target(
        &ctx.db,
        &key,
        ctx.identity(),
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "delete_content resolve reports db error");
        Status::internal("internal server error")
    })?;

    tracing::info!(
        moderator = ctx.identity(),
        target = ?target,
        events = erased.events,
        content = erased.content,
        "content deleted"
    );
    Ok(DeleteContentResponse {})
}
