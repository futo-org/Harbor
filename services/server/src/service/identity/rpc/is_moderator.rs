//! `is_moderator`: returns whether `moderator_identity` is a moderator
//! on this server. Signed by one of that identity's authorized keys.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::validate_moderation_request;
use crate::service::proto::{IsModeratorResponse, SignedMessage};
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    msg: SignedMessage,
) -> Result<IsModeratorResponse, Status> {
    let request = validate_moderation_request(ctx, server_name, msg).await?;

    let is_moderator =
        id_repo::Query::is_moderator(&ctx.db, &request.moderator_identity)
            .await
            .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsModeratorResponse { is_moderator })
}
