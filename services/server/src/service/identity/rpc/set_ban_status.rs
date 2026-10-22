//! `set_ban_status`: bans or unbans an identity on this server after
//! verifying the caller is a moderator. The ban is attributed to the
//! authenticated moderator identity.

use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::identity::repository;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::identity::service::erase_identity;
use crate::service::proto::{SetBanStatusRequest, SetBanStatusResponse};

pub async fn handle(
    mut ctx: AuthContext,
    req: SetBanStatusRequest,
) -> Result<SetBanStatusResponse, Status> {
    require_moderator(&ctx).await?;
    let moderator_identity = &ctx.auth;

    repository::Mutation::set_banned(
        &ctx.db,
        &req.target_identity,
        req.banned,
        moderator_identity,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "set_ban_status db error");
        Status::internal("internal server error")
    })?;

    tracing::info!(
        moderator = moderator_identity,
        target = req.target_identity,
        banned = req.banned,
        "ban status changed"
    );

    if req.banned {
        erase_identity(
            &mut ctx.db,
            None,
            Some(&ctx.proof_cache),
            &req.target_identity,
        )
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "set_ban_status erase error");
            Status::internal("internal server error")
        })?;
    }

    Ok(SetBanStatusResponse {})
}
