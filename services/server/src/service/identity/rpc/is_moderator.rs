//! `is_moderator`: returns whether an identity is a moderator on this
//! server after verifying the request is signed by one of the
//! identity's authorized keys.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    authorize_signer, check_timestamp_skew, verify_signed_message,
};
use crate::service::proto as Proto;
use crate::service::proto::{IsModeratorResponse, SignedMessage};
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

    authorize_signer(ctx, &body.identity, &public_key).await?;

    let is_moderator = id_repo::Query::is_moderator(&ctx.db, &body.identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsModeratorResponse { is_moderator })
}
