//! `create_pairing_session`: registers a new pairing session after
//! verifying the caller is a rotation key.

use chrono::Utc;
use prost::Message;
use tonic::Status;

use crate::service::context::ServiceContext;
use crate::service::identity::pairing::repository as pair_repo;
use crate::service::identity::repository as id_repo;
use crate::service::proto as Proto;
use crate::service::proto::{
    CreatePairingSessionRequest, CreatePairingSessionResponse,
};

pub async fn handle(
    ctx: &ServiceContext,
    req: CreatePairingSessionRequest,
) -> Result<CreatePairingSessionResponse, Status> {
    let msg = req.signed_message.ok_or_else(|| {
        Status::invalid_argument("signed_message is required")
    })?;

    let (public_key, message_bytes, msg_sig) = msg
        .open_with_sig()
        .ok_or_else(|| Status::unauthenticated("invalid signature"))?;

    let initial_session =
        Proto::InitialPairingSession::decode(message_bytes.as_slice())
            .map_err(|_| Status::invalid_argument("invalid session"))?;

    let now = Utc::now();
    let skew_ms: i64 = 30 * 60 * 1000;
    if (initial_session.timestamp - now.timestamp_millis()).abs() > skew_ms {
        return Err(Status::invalid_argument(
            "session timestamp outside acceptable skew window",
        ));
    }

    let created_at = now;
    let expires_at = created_at
        + chrono::Duration::seconds(
            pair_repo::PAIRING_SESSION_TTL_SECONDS as i64,
        );

    let issuer_identity = initial_session.issuer_identity.clone();
    let pairing_session_signature = hex::encode(msg_sig);

    let is_rotation_key = id_repo::Query::is_rotation_key(
        &ctx.db,
        &issuer_identity,
        public_key.key.as_slice(),
    )
    .await
    .map_err(|_| Status::internal("internal server error"))?;

    if !is_rotation_key {
        return Err(Status::permission_denied("not authorized"));
    }

    let row = pair_repo::Query::create_pairing_session(
        &ctx.db,
        &issuer_identity,
        &pairing_session_signature,
        &public_key,
        created_at,
        expires_at,
    )
    .await
    .map_err(|_| Status::internal("internal server error"))?;

    Ok(CreatePairingSessionResponse {
        session: Some(Proto::PairingSession {
            pairing_session_signature: row.pairing_session_signature,
            signed_by: Some(Proto::PublicKey {
                key_type: row.signed_by_key_type,
                key: row.signed_by_key,
            }),
            issuer_identity: row.issuer_identity,
            created_at: row.created_at.timestamp_millis(),
            expires_at: row.expires_at.timestamp_millis(),
            claimer_pubkeys: vec![],
        }),
    })
}
