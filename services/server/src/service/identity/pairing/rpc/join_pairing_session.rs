//! `join_pairing_session`: records a claimer key on a pairing session.

use crate::service::identity::pairing::repository as pair_repo;
use crate::service::identity::pairing::rpc::common::{
    list_claimers, session_state,
};
use crate::service::proto::{
    JoinPairingSessionRequest, JoinPairingSessionResponse,
};
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    req: JoinPairingSessionRequest,
) -> Result<JoinPairingSessionResponse, Status> {
    let claimer_key = req
        .claimer_key
        .ok_or_else(|| Status::invalid_argument("claimer_key is required"))?;
    if claimer_key.key.is_empty() {
        return Err(Status::invalid_argument("claimer_key.key is required"));
    }

    let session = pair_repo::Query::get_pairing_session(db, &req.digest_sha256)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "join_pairing_session lookup db error");
            Status::internal("internal server error")
        })?
        .ok_or_else(|| Status::not_found("session not found"))?;

    pair_repo::Query::add_claimer(
        db,
        &session.issuer_identity,
        &req.digest_sha256,
        &claimer_key,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "join_pairing_session add claimer db error");
        Status::internal("internal server error")
    })?;

    let claimers = list_claimers(db, &req.digest_sha256).await?;

    Ok(JoinPairingSessionResponse {
        session_state: Some(session_state(&session, claimers)),
    })
}
