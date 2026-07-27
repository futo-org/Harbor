//! `is_banned`: returns whether an identity is banned on this server.
//! Requires the signer to be a moderator.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::{
    authorize_signer, require_moderator,
};
use crate::service::proto::{IsBannedRequest, IsBannedResponse};
use chrono::Utc;
use polycentric_common::http_sig;
use tonic::{Request, Status};

const OPERATION: &str = "/polycentric.v2.IdentityService/IsBanned";

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    request: Request<IsBannedRequest>,
) -> Result<IsBannedResponse, Status> {
    let verified = http_sig::verify_signed_request(
        server_name,
        OPERATION,
        request.metadata(),
        Utc::now().timestamp_millis(),
    )?;
    authorize_signer(ctx, &verified).await?;
    require_moderator(ctx, &verified.keyid).await?;

    let body = request.into_inner();

    let is_banned = id_repo::Query::is_banned(&ctx.db, &body.target_identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsBannedResponse { is_banned })
}
