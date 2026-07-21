//! `list_bans`: lists the identities banned on this server. Requires the
//! signer to be a moderator.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    require_moderator, validate_moderation_request,
};
use crate::service::proto::{ListBansResponse, SignedMessage};
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    msg: SignedMessage,
) -> Result<ListBansResponse, Status> {
    let request = validate_moderation_request(ctx, server_name, msg).await?;
    require_moderator(ctx, &request.moderator_identity).await?;

    let banned_identities = id_repo::Query::list_bans(&ctx.db)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(ListBansResponse { banned_identities })
}
