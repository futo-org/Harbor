//! `set_ban_status`: bans or unbans an identity on this server after
//! verifying the request is signed by one of a moderator's authorized
//! keys.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    authorize_signer, check_timestamp_skew, verify_signed_message,
};
use crate::service::proto as Proto;
use crate::service::proto::{SetBanStatusResponse, SignedMessage};
use polycentric_common::models::collections;
use prost::Message;
use sea_orm::TransactionTrait;
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    msg: SignedMessage,
) -> Result<SetBanStatusResponse, Status> {
    let public_key = verify_signed_message(&msg)?;

    let body = Proto::SetBanStatusBody::decode(&msg.message_bytes[..])
        .map_err(|_| {
            Status::invalid_argument("Argument is not a SetBanStatusBody")
        })?;

    // The signed body names the server it is addressed to, so a server
    // that receives it cannot relay it to another server.
    if body.server_url != server_name {
        return Err(Status::permission_denied(
            "request is addressed to a different server",
        ));
    }

    check_timestamp_skew(body.timestamp)?;

    authorize_signer(ctx, &body.moderator_identity, &public_key).await?;

    let is_moderator =
        id_repo::Query::is_moderator(&ctx.db, &body.moderator_identity)
            .await
            .map_err(|_| Status::internal("internal server error"))?;
    if !is_moderator {
        return Err(Status::permission_denied("not a moderator"));
    }

    let txn = ctx.db.begin().await.map_err(|e| {
        eprintln!("set_ban_status txn begin error: {e}");
        Status::internal("internal server error")
    })?;
    id_repo::Mutation::set_banned(&txn, &body.target_identity, body.banned)
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
        body.moderator_identity,
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
