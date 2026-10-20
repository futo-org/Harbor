//! `is_banned`: returns whether an identity is banned on this server.
//! Requires the caller to be a moderator.

use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::proto::{IsBannedRequest, IsBannedResponse};

pub async fn handle(
    ctx: AuthContext,
    req: IsBannedRequest,
) -> Result<IsBannedResponse, Status> {
    require_moderator(&ctx).await?;

    let is_banned = id_repo::Query::is_banned(&ctx.db, &req.target_identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsBannedResponse { is_banned })
}
