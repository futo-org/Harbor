//! `join_pairing_session`: records a claimer key for an active
//! pairing session and returns the updated session. Expired sessions
//! are deleted before returning an expiry error.

use crate::service::identity::pairing::repository as pair_repo;
use crate::service::identity::pairing::rpc::common::{
    build_pairing_session, verify_signed_message,
};
use crate::service::proto::{
    JoinPairingSessionBody, JoinPairingSessionRequest,
    JoinPairingSessionResponse,
};
use prost::Message;
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    req: JoinPairingSessionRequest,
) -> Result<JoinPairingSessionResponse, Status> {
    let msg = req.signed_message.ok_or_else(|| {
        Status::invalid_argument("signed_message is required")
    })?;
    let public_key = verify_signed_message(&msg)?;

    let body = JoinPairingSessionBody::decode(&msg.message_bytes[..])
        .map_err(|_| Status::invalid_argument("invalid body"))?;

    let session = pair_repo::Query::get_pairing_session(
        db,
        &body.pairing_session_signature,
    )
    .await
    .map_err(|_| Status::not_found("session not found"))?;
    if pair_repo::is_pairing_session_expired(&session) {
        pair_repo::Query::delete_pairing_session(
            db,
            &body.pairing_session_signature,
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;
        return Err(Status::deadline_exceeded("session expired"));
    }

    pair_repo::Query::add_claimer_pubkey(
        db,
        &body.pairing_session_signature,
        &public_key,
    )
    .await
    .map_err(|_| Status::internal("internal server error"))?;

    let session =
        build_pairing_session(db, &body.pairing_session_signature).await?;

    Ok(JoinPairingSessionResponse {
        session: Some(session),
    })
}
