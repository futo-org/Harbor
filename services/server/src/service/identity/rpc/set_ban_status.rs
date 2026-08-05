//! `set_ban_status`: bans or unbans an identity on this server after
//! verifying the caller is a moderator. The ban is attributed to the
//! authenticated moderator identity.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::proto::{SetBanStatusRequest, SetBanStatusResponse};
use polycentric_common::models::collections;
use sea_orm::TransactionTrait;
use tonic::{Request, Status};

pub async fn handle(
    ctx: &ServiceContext,
    request: Request<SetBanStatusRequest>,
) -> Result<SetBanStatusResponse, Status> {
    let moderator_identity = require_moderator(ctx, &request).await?;

    let body = request.into_inner();

    let txn = ctx.db.begin().await.map_err(|e| {
        tracing::error!(error = %e, "set_ban_status txn begin error");
        Status::internal("internal server error")
    })?;
    id_repo::Mutation::set_banned(
        &txn,
        &body.target_identity,
        body.banned,
        &moderator_identity,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "set_ban_status db error");
        Status::internal("internal server error")
    })?;
    if body.banned {
        id_repo::Mutation::erase_identity_content(&txn, &body.target_identity)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "set_ban_status erase error");
                Status::internal("internal server error")
            })?;
    }
    txn.commit().await.map_err(|e| {
        tracing::error!(error = %e, "set_ban_status txn commit error");
        Status::internal("internal server error")
    })?;

    tracing::info!(
        moderator = moderator_identity,
        target = body.target_identity,
        banned = body.banned,
        "ban status changed"
    );

    if body.banned {
        // The erased identity's cached chain head and canonical heads
        // no longer match the database.
        ctx.proof_cache
            .invalidate_identity(&body.target_identity)
            .await;
        for collection in [
            collections::IDENTITY,
            collections::FEED,
            collections::PROFILE,
            collections::INTERACTIONS,
            collections::SOCIAL_GRAPH,
            collections::REPORTS,
            collections::LABELS,
            collections::VERIFICATIONS,
        ] {
            ctx.proof_cache
                .invalidate_canonical(&body.target_identity, collection)
                .await;
        }
    }

    Ok(SetBanStatusResponse {})
}
