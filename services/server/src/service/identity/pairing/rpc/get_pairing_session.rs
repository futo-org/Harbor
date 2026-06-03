//! `get_pairing_session`: returns a pairing session for an active
//! session signature. Expired sessions are deleted and treated as
//! not found.

use crate::service::identity::pairing::rpc::common::build_pairing_session;
use crate::service::proto::{
    GetPairingSessionRequest, GetPairingSessionResponse,
};
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    req: GetPairingSessionRequest,
) -> Result<GetPairingSessionResponse, Status> {
    let session =
        build_pairing_session(db, &req.pairing_session_signature).await?;

    Ok(GetPairingSessionResponse {
        session: Some(session),
    })
}
