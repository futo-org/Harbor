//! `is_moderator`: returns whether the calling identity is a moderator on
//! this server. Authenticated by the bearer JWT (the caller is the
//! subject).

use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::identity::repository as id_repo;
use crate::service::proto::{IsModeratorRequest, IsModeratorResponse};

pub async fn handle(
    ctx: AuthContext,
    _: IsModeratorRequest,
) -> Result<IsModeratorResponse, Status> {
    let identity = ctx.identity();

    let is_moderator = id_repo::Query::is_moderator(&ctx.db, identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsModeratorResponse { is_moderator })
}
