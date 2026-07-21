//! `is_banned`: returns whether an identity is banned on this server.
//! Requires the signer to be a moderator.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    require_moderator, validate_moderation_request,
};
use crate::service::proto as Proto;
use crate::service::proto::{IsBannedResponse, SignedMessage};
use prost::Message;
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    msg: SignedMessage,
) -> Result<IsBannedResponse, Status> {
    let request = validate_moderation_request(ctx, server_name, msg).await?;
    require_moderator(ctx, &request.moderator_identity).await?;

    let body =
        Proto::IsBannedRequest::decode(&request.body[..]).map_err(|_| {
            Status::invalid_argument("body is not an IsBannedRequest")
        })?;

    let is_banned = id_repo::Query::is_banned(&ctx.db, &body.target_identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsBannedResponse { is_banned })
}
