//! `join_pairing_session`: records a claimer key for an active
//! pairing session and returns the updated session. Expired sessions
//! are deleted before returning an expiry error.

use prost::Message;
use tonic::Status;

use crate::service::context::ServiceContext;
use crate::service::identity::pairing::repository as pair_repo;
use crate::service::identity::pairing::rpc::common::build_pairing_session;
use crate::service::proto::{
    JoinPairingSessionBody, JoinPairingSessionRequest,
    JoinPairingSessionResponse,
};

pub async fn handle(
    ctx: &ServiceContext,
    req: JoinPairingSessionRequest,
) -> Result<JoinPairingSessionResponse, Status> {
    let msg = req.signed_message.ok_or_else(|| {
        Status::invalid_argument("signed_message is required")
    })?;

    let (public_key, msg_bytes) = msg
        .open()
        .ok_or_else(|| Status::unauthenticated("invalid signature"))?;

    let body = JoinPairingSessionBody::decode(msg_bytes.as_slice())
        .map_err(|_| Status::invalid_argument("invalid body"))?;

    let session = pair_repo::Query::get_pairing_session(
        &ctx.db,
        &body.pairing_session_signature,
    )
    .await
    .map_err(|_| Status::not_found("session not found"))?;
    if pair_repo::is_pairing_session_expired(&session) {
        pair_repo::Query::delete_pairing_session(
            &ctx.db,
            &body.pairing_session_signature,
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;
        return Err(Status::deadline_exceeded("session expired"));
    }

    pair_repo::Query::add_claimer_pubkey(
        &ctx.db,
        &body.pairing_session_signature,
        &public_key,
    )
    .await
    .map_err(|_| Status::internal("internal server error"))?;

    let session =
        build_pairing_session(&ctx.db, &body.pairing_session_signature).await?;

    Ok(JoinPairingSessionResponse {
        session: Some(session),
    })
}
