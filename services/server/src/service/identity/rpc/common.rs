//! Helpers shared across signed identity RPC handlers.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::proto as Proto;
use crate::service::proto::{ModerationRequest, SignedMessage};
use chrono::Utc;
use prost::Message;
use tonic::Status;

/// Maximum accepted difference between a signed body's timestamp and
/// the server clock.
const TIMESTAMP_SKEW_MS: i64 = 30 * 60 * 1000;

/// Rejects a signed body's timestamp (unix milliseconds) when it falls
/// outside the acceptable skew window around the server clock.
/// Saturating arithmetic so extreme timestamps can't wrap the
/// difference back inside the window.
pub fn check_timestamp_skew(timestamp_ms: i64) -> Result<(), Status> {
    if timestamp_ms
        .saturating_sub(Utc::now().timestamp_millis())
        .saturating_abs()
        > TIMESTAMP_SKEW_MS
    {
        return Err(Status::invalid_argument(
            "timestamp outside acceptable skew window",
        ));
    }
    Ok(())
}

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

/// Rejects unless `public_key` is one of `identity`'s currently
/// authorized keys.
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
    identity: &str,
    public_key: &Proto::PublicKey,
) -> Result<(), Status> {
    let authorized =
        id_repo::Query::latest_valid_identity_content(&ctx.db, identity)
            .await
            .map_err(|e| {
                eprintln!("authorize_signer db error: {e}");
                Status::internal("internal server error")
            })?
            .is_some_and(|content| content.authorizes_signer(public_key));
    if !authorized {
        return Err(Status::permission_denied("not authorized"));
    }
    Ok(())
}

/// Decode and validate the signed `ModerationRequest` common to every
/// moderation endpoint: verifies the signature, that the request is
/// addressed to this server, that the timestamp is fresh, and that the
/// signer controls `moderator_identity`. The returned request still
/// holds the endpoint-specific `body` bytes for the caller to decode.
///
/// Does NOT check moderator status — `IsModerator` must answer for
/// non-moderators too. Endpoints that require moderator privileges call
/// [`require_moderator`] with the returned `moderator_identity`.
pub async fn validate_moderation_request(
    ctx: &ServiceContext,
    server_name: &str,
    msg: SignedMessage,
) -> Result<ModerationRequest, Status> {
    let public_key = verify_signed_message(&msg)?;

    let request =
        ModerationRequest::decode(&msg.message_bytes[..]).map_err(|_| {
            Status::invalid_argument("Argument is not a ModerationRequest")
        })?;

    // The signed body names the server it is addressed to, so a server
    // that receives it cannot relay it to another server.
    if request.server_url != server_name {
        return Err(Status::permission_denied(
            "request is addressed to a different server",
        ));
    }

    check_timestamp_skew(request.timestamp)?;

    authorize_signer(ctx, &request.moderator_identity, &public_key).await?;

    Ok(request)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_timestamp_skew_accepts_current_time() {
        assert!(check_timestamp_skew(Utc::now().timestamp_millis()).is_ok());
    }

    #[test]
    fn check_timestamp_skew_rejects_stale_timestamp() {
        let stale = Utc::now().timestamp_millis() - 60 * 60 * 1000;
        assert!(check_timestamp_skew(stale).is_err());
    }

    #[test]
    fn check_timestamp_skew_rejects_extreme_timestamps() {
        // i64::MIN + now makes the naive difference wrap to exactly
        // i64::MIN, whose abs() is negative in release builds and would
        // spuriously pass the window without saturating arithmetic.
        assert!(check_timestamp_skew(i64::MIN).is_err());
        assert!(check_timestamp_skew(i64::MAX).is_err());
        assert!(
            check_timestamp_skew(
                i64::MIN.wrapping_add(Utc::now().timestamp_millis())
            )
            .is_err()
        );
    }
}
