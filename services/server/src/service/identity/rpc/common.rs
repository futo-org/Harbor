//! Helpers shared across signed identity RPC handlers.

use crate::service::context::ServiceContext;
use crate::service::identity::repository as id_repo;
use crate::service::proto as Proto;
use crate::service::proto::{Identity, SignedMessage};
use chrono::Utc;
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
pub async fn authorize_signer(
    ctx: &ServiceContext,
    identity: &str,
    public_key: &Proto::PublicKey,
) -> Result<(), Status> {
    let authorized = identity_content(ctx, identity)
        .await?
        .is_some_and(|content| content.authorizes_signer(public_key));
    if !authorized {
        return Err(Status::permission_denied("not authorized"));
    }
    Ok(())
}

/// The identity's chain-head content, from the proof cache or the DB
/// (warming the cache on a miss). `None` when no valid genesis exists.
async fn identity_content(
    ctx: &ServiceContext,
    identity: &str,
) -> Result<Option<Identity>, Status> {
    if let Some(content) = ctx.proof_cache.identity_content(identity).await {
        return Ok(Some(content));
    }
    let Some(loaded) =
        id_repo::Query::latest_valid_identity_content(&ctx.db, identity)
            .await
            .map_err(|e| {
                eprintln!("identity_content db error: {e}");
                Status::internal("internal server error")
            })?
    else {
        return Ok(None);
    };
    ctx.proof_cache
        .warm_identity_content(identity, loaded.clone())
        .await;
    Ok(Some(loaded))
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
