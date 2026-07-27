//! Helpers shared across signed identity RPC handlers.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::proto as Proto;
use crate::service::proto::SignedMessage;
use polycentric_common::http_sig::VerifiedSignature;
use tonic::Status;

/// Verifies a signed request and returns the signer public key.
pub fn verify_signed_message(
    msg: &SignedMessage,
) -> Result<Proto::PublicKey, Status> {
    let public_key = msg
        .public_key
        .clone()
        .ok_or_else(|| Status::invalid_argument("public_key is required"))?;
    polycentric_common::signing::verify_signature(
        &public_key.key,
        &msg.signature,
        &msg.message_bytes,
    )
    .map_err(|e| Status::unauthenticated(e.to_string()))?;
    Ok(public_key)
}

/// Rejects unless the key that signed the request
/// (`http_sig::verify_signed_request`) is one of the claimed identity's
/// currently-authorized keys — the step that turns "a valid signature by
/// some key" into "a request from this identity".
///
/// Authorization walks the validated identity chain directly rather than
/// reading `proof_cache`: the cache is also populated by feed/profile
/// hydration (`warm_identity_cache`), which caches the highest-sequence
/// raw IDENTITY event with no genesis or rotation-chain validation. Since
/// `put_events` accepts IDENTITY-collection events without authorization,
/// trusting the cache here would let a forged IDENTITY event authorize an
/// attacker's key as a moderator.
pub async fn authorize_signer(
    ctx: &ServiceContext,
    verified: &VerifiedSignature,
) -> Result<(), Status> {
    let public_key = Proto::PublicKey {
        key_type: Proto::KeyType::Ed25519.into(),
        key: verified.public_key.clone(),
    };
    let authorized =
        id_repo::Query::latest_valid_identity_content(&ctx.db, &verified.keyid)
            .await
            .map_err(|e| {
                eprintln!("authorize_signer db error: {e}");
                Status::internal("internal server error")
            })?
            .is_some_and(|content| content.authorizes_signer(&public_key));
    if !authorized {
        return Err(Status::permission_denied("not authorized"));
    }
    Ok(())
}

/// Rejects unless `identity` is a moderator on this server.
pub async fn require_moderator(
    ctx: &ServiceContext,
    identity: &str,
) -> Result<(), Status> {
    let is_moderator = id_repo::Query::is_moderator(&ctx.db, identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;
    if !is_moderator {
        return Err(Status::permission_denied("not a moderator"));
    }
    Ok(())
}
