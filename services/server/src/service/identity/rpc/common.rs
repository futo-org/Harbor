//! Helpers shared across signed identity RPC handlers.

use crate::service::proto as Proto;
use crate::service::proto::SignedMessage;
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
