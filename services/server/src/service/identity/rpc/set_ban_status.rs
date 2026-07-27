//! `set_ban_status`: bans or unbans an identity on this server after
//! verifying the request is signed by one of a moderator's authorized
//! keys.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    authorize_signer, require_moderator,
};
use crate::service::proto::{SetBanStatusRequest, SetBanStatusResponse};
use chrono::Utc;
use polycentric_common::http_sig;
use polycentric_common::models::collections;
use sea_orm::TransactionTrait;
use tonic::{Request, Status};

const OPERATION: &str = "/polycentric.v2.IdentityService/SetBanStatus";

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    request: Request<SetBanStatusRequest>,
) -> Result<SetBanStatusResponse, Status> {
    let verified = http_sig::verify_signed_request(
        server_name,
        OPERATION,
        request.metadata(),
        Utc::now().timestamp_millis(),
    )?;
    authorize_signer(ctx, &verified).await?;
    require_moderator(ctx, &verified.keyid).await?;
    let moderator_identity = verified.keyid;

    let body = request.into_inner();

    let txn = ctx.db.begin().await.map_err(|e| {
        eprintln!("set_ban_status txn begin error: {e}");
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
        eprintln!("set_ban_status db error: {e}");
        Status::internal("internal server error")
    })?;
    if body.banned {
        id_repo::Mutation::erase_identity_content(&txn, &body.target_identity)
            .await
            .map_err(|e| {
                eprintln!("set_ban_status erase error: {e}");
                Status::internal("internal server error")
            })?;
    }
    txn.commit().await.map_err(|e| {
        eprintln!("set_ban_status txn commit error: {e}");
        Status::internal("internal server error")
    })?;

    println!(
        "{} set {}'s state to {}",
        moderator_identity,
        body.target_identity,
        if body.banned { "banned" } else { "unbanned" },
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
