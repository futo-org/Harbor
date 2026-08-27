//! `get_pairing_session`: returns the aggregated state of a pairing session.

use crate::service::identity::pairing::rpc::common::load_session_state;
use crate::service::proto::{
    GetPairingSessionRequest, GetPairingSessionResponse,
};
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    req: GetPairingSessionRequest,
) -> Result<GetPairingSessionResponse, Status> {
    let session_state = load_session_state(db, &req.digest_sha256).await?;

    Ok(GetPairingSessionResponse {
        session_state: Some(session_state),
    })
}
