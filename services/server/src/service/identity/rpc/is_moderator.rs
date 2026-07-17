//! `is_moderator`: returns whether an identity is a moderator on this
//! server after verifying the request is signed by one of the
//! identity's authorized keys.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    check_timestamp_skew, verify_signed_message,
};
use crate::service::proto as Proto;
use crate::service::proto::{Identity, IsModeratorResponse, SignedMessage};
use prost::Message;
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    msg: SignedMessage,
) -> Result<IsModeratorResponse, Status> {
    let public_key = verify_signed_message(&msg)?;

    let body = Proto::IsModeratorBody::decode(&msg.message_bytes[..]).map_err(
        |_| Status::invalid_argument("Argument is not an IsModeratorBody"),
    )?;

    // The signed body names the server it is addressed to, so a server
    // that receives it cannot relay it to another server.
    if body.server_url != server_name {
        return Err(Status::permission_denied(
            "request is addressed to a different server",
        ));
    }

    check_timestamp_skew(body.timestamp)?;

    let authorized = identity_content(ctx, &body.identity)
        .await?
        .is_some_and(|content| content.authorizes_signer(&public_key));
    if !authorized {
        return Err(Status::permission_denied("not authorized"));
    }

    let is_moderator = id_repo::Query::is_moderator(&ctx.db, &body.identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsModeratorResponse { is_moderator })
}

/// The identity's chain-head content, from the proof cache or the DB
/// (warming the cache on a miss). `None` when no valid genesis exists.
async fn identity_content(
    ctx: &ServiceContext,
    identity: &str,
) -> Result<Option<Identity>, Status> {
    if let Some(content) = ctx.proof_cache.identity_content(identity).await {
        return Ok(Some(content));
    }
    let Some(loaded) =
        id_repo::Query::latest_valid_identity_content(&ctx.db, identity)
            .await
            .map_err(|e| {
                eprintln!("is_moderator db error: {e}");
                Status::internal("internal server error")
            })?
    else {
        return Ok(None);
    };
    ctx.proof_cache
        .warm_identity_content(identity, loaded.clone())
        .await;
    Ok(Some(loaded))
}
