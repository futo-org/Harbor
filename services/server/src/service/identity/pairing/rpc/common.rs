//! Helpers shared across the pairing RPC handlers.

use crate::service::identity::pairing::repository as pair_repo;
use crate::service::proto as Proto;
use crate::service::proto::SignedMessage;
use ::entity::pairing_session_model as PairingSessionModel;
use sea_orm::DbConn;
use tonic::Status;

/// Assembles the aggregated state from a stored session row and its claimers.
pub fn session_state(
    session: &PairingSessionModel::Model,
    claimers: Vec<Proto::PublicKey>,
) -> Proto::PairingSessionState {
    let issuer_key = Proto::PublicKey {
        key_type: session.issuer_key_type,
        key: session.issuer_key.clone(),
    };

    let issuer_state = SignedMessage {
        signature: session.issuer_state_signature.clone(),
        message_bytes: session.issuer_state_bytes.clone(),
        public_key: Some(issuer_key),
    };

    Proto::PairingSessionState {
        issuer_state: Some(issuer_state),
        claimers,
    }
}

/// Derive an aggregated session state from the database.
pub async fn load_session_state(
    db: &DbConn,
    digest_sha256: &[u8],
) -> Result<Proto::PairingSessionState, Status> {
    let session = pair_repo::Query::get_pairing_session(db, digest_sha256)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "pairing session lookup db error");
            Status::internal("internal server error")
        })?
        .ok_or_else(|| Status::not_found("session not found"))?;

    let claimers = list_claimers(db, digest_sha256).await?;

    Ok(session_state(&session, claimers))
}

/// Lists a session's claimers, mapping database failures to a status.
pub async fn list_claimers(
    db: &DbConn,
    digest_sha256: &[u8],
) -> Result<Vec<Proto::PublicKey>, Status> {
    pair_repo::Query::list_claimers(db, digest_sha256)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "pairing claimer list db error");
            Status::internal("internal server error")
        })
}
