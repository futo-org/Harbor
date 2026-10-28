//! Bearer JWT verification, as the server does it: signature, audience and
//! expiry, then the signing key against the issuer's identity document.

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use polycentric_common::jwt;
use polycentric_common::models::protos_v2::{KeyType, PublicKey};

use crate::routes::AppState;

/// The verified identity of a request, available via request extensions.
#[derive(Debug, Clone, PartialEq)]
pub struct AuthenticatedIdentity {
    pub identity: String,
    /// Hex of the Ed25519 public key that signed the token.
    pub signing_key: String,
}

pub enum AuthError {
    Missing,
    Invalid(String),
    Unauthorized,
    Unavailable(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        match self {
            AuthError::Missing => (StatusCode::UNAUTHORIZED, "missing bearer token"),
            AuthError::Invalid(reason) => {
                tracing::debug!(reason, "auth token rejected");
                (StatusCode::UNAUTHORIZED, "invalid bearer token")
            }
            AuthError::Unauthorized => (
                StatusCode::FORBIDDEN,
                "signing key is not authorized by the issuer's identity",
            ),
            AuthError::Unavailable(reason) => {
                tracing::warn!(reason, "identity lookup unavailable");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "identity lookup unavailable",
                )
            }
        }
        .into_response()
    }
}

pub async fn authenticate(
    state: &AppState,
    token: Option<&str>,
    now: u64,
) -> Result<AuthenticatedIdentity, AuthError> {
    let token = token.ok_or(AuthError::Missing)?;
    let verified = jwt::verify_jwt(token).map_err(|e| AuthError::Invalid(e.to_string()))?;
    verified
        .validate(&state.config.allow_hosts, now)
        .map_err(|e| AuthError::Invalid(e.to_string()))?;

    let signer = PublicKey {
        key_type: KeyType::Ed25519 as i32,
        key: verified.signed_by.clone(),
    };
    let authorized = state
        .identities
        .authorizes(&verified.claims.iss, &signer)
        .await
        .map_err(AuthError::Unavailable)?;
    if !authorized {
        return Err(AuthError::Unauthorized);
    }

    Ok(AuthenticatedIdentity {
        identity: verified.claims.iss,
        signing_key: hex::encode(verified.signed_by),
    })
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let token = request
        .headers()
        .get(http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string);

    match authenticate(&state, token.as_deref(), now_secs()).await {
        Ok(identity) => {
            request.extensions_mut().insert(identity);
            next.run(request).await
        }
        Err(error) => error.into_response(),
    }
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{AUD, ISS, StubIdentities, mint, signing_key, signing_key_hex, state};
    use ed25519_dalek::SigningKey;
    use std::sync::Arc;

    fn status(error: AuthError) -> StatusCode {
        error.into_response().status()
    }

    #[tokio::test]
    async fn accepts_an_authorized_token() {
        let token = mint(&signing_key(), ISS, AUD, 2_000);
        let identity = authenticate(&state(None, None), Some(&token), 1_000)
            .await
            .ok()
            .unwrap();
        assert_eq!(
            identity,
            AuthenticatedIdentity {
                identity: ISS.to_string(),
                signing_key: signing_key_hex(),
            }
        );
    }

    #[tokio::test]
    async fn missing_token_is_unauthorized() {
        let error = authenticate(&state(None, None), None, 1_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn malformed_token_is_unauthorized() {
        let error = authenticate(&state(None, None), Some("not.a.jwt"), 1_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn wrong_audience_is_unauthorized() {
        let token = mint(&signing_key(), ISS, "https://elsewhere", 2_000);
        let error = authenticate(&state(None, None), Some(&token), 1_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn expired_token_is_unauthorized() {
        let token = mint(&signing_key(), ISS, AUD, 2_000);
        let error = authenticate(&state(None, None), Some(&token), 2_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn unauthorized_signer_is_forbidden() {
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let token = mint(&other, ISS, AUD, 2_000);
        let error = authenticate(&state(None, None), Some(&token), 1_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn unknown_issuer_is_forbidden() {
        let token = mint(&signing_key(), "someone-else", AUD, 2_000);
        let error = authenticate(&state(None, None), Some(&token), 1_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn failed_identity_lookup_is_unavailable() {
        let mut state = state(None, None);
        state.identities = Arc::new(StubIdentities { failing: true });
        let token = mint(&signing_key(), ISS, AUD, 2_000);
        let error = authenticate(&state, Some(&token), 1_000)
            .await
            .err()
            .unwrap();
        assert_eq!(status(error), StatusCode::SERVICE_UNAVAILABLE);
    }
}
