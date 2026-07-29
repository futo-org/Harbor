//! `is_banned`: returns whether an identity is banned on this server.
//!
//! UNPROTECTED: the moderator-signature check that used to guard this
//! endpoint has been removed. TODO(auth): require a moderator once the
//! new auth layer lands.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::proto::{IsBannedRequest, IsBannedResponse};
use tonic::{Request, Status};

pub async fn handle(
    ctx: &ServiceContext,
    request: Request<IsBannedRequest>,
) -> Result<IsBannedResponse, Status> {
    let body = request.into_inner();

    let is_banned = id_repo::Query::is_banned(&ctx.db, &body.target_identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsBannedResponse { is_banned })
}
