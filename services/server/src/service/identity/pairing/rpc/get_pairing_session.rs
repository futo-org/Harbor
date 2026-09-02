//! `get_pairing_session`: returns a pairing session for an active
//! session signature. Expired sessions are deleted and treated as
//! not found.

use tonic::Status;

use crate::service::context::ServiceContext;
use crate::service::identity::pairing::rpc::common::build_pairing_session;
use crate::service::proto::{
    GetPairingSessionRequest, GetPairingSessionResponse,
};

pub async fn handle(
    ctx: &ServiceContext,
    req: GetPairingSessionRequest,
) -> Result<GetPairingSessionResponse, Status> {
    let session =
        build_pairing_session(&ctx.db, &req.pairing_session_signature).await?;

    Ok(GetPairingSessionResponse {
        session: Some(session),
    })
}
