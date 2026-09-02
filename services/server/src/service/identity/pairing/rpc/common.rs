//! Helpers shared across the pairing RPC handlers.

use sea_orm::DatabaseConnection;
use tonic::Status;

use crate::service::identity::pairing::repository as pair_repo;
use crate::service::proto as Proto;

/// Builds `PairingSession` from the stored session row and current claimers.
/// Expired sessions are deleted and reported as not found.
pub async fn build_pairing_session(
    db: &DatabaseConnection,
    pairing_session_signature: &str,
) -> Result<Proto::PairingSession, Status> {
    let session =
        pair_repo::Query::get_pairing_session(db, pairing_session_signature)
            .await
            .map_err(|_| Status::not_found("session not found"))?;

    if pair_repo::is_pairing_session_expired(&session) {
        pair_repo::Query::delete_pairing_session(db, pairing_session_signature)
            .await
            .map_err(|_| Status::internal("internal server error"))?;
        return Err(Status::not_found("session not found"));
    }

    let claimer_pubkeys =
        pair_repo::Query::list_claimer_pubkeys(db, pairing_session_signature)
            .await
            .map_err(|_| Status::internal("internal server error"))?;

    Ok(Proto::PairingSession {
        pairing_session_signature: session.pairing_session_signature.clone(),
        signed_by: Some(Proto::PublicKey {
            key_type: session.signed_by_key_type,
            key: session.signed_by_key.clone(),
        }),
        issuer_identity: session.issuer_identity.clone(),
        created_at: session.created_at.timestamp_millis(),
        expires_at: session.expires_at.timestamp_millis(),
        claimer_pubkeys,
    })
}
