//! `is_moderator`: returns whether the signer is a moderator on this
//! server. Authenticated by signed gRPC metadata (`keyid` is the subject).

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::identity::rpc::common::authorize_signer;
use crate::service::proto::{IsModeratorRequest, IsModeratorResponse};
use chrono::Utc;
use polycentric_common::http_sig;
use tonic::{Request, Status};

const OPERATION: &str = "/polycentric.v2.IdentityService/IsModerator";

pub async fn handle(
    ctx: &ServiceContext,
    server_name: &str,
    request: Request<IsModeratorRequest>,
) -> Result<IsModeratorResponse, Status> {
    let verified = http_sig::verify_signed_request(
        server_name,
        OPERATION,
        request.metadata(),
        Utc::now().timestamp_millis(),
    )?;
    authorize_signer(ctx, &verified).await?;

    let is_moderator = id_repo::Query::is_moderator(&ctx.db, &verified.keyid)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(IsModeratorResponse { is_moderator })
}
