//! Bearer JWT verification, as the server does it: signature, audience and
//! expiry, then the signing key against the issuer's identity document.

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use polycentric_common::jwt;

use crate::routes::AppState;

/// The verified identity of a request, available via request extensions.
#[derive(Debug, Clone, PartialEq)]
pub struct AuthenticatedIdentity {
    pub identity: String,
    /// String representation of a `PublicKey`.
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

    let authorized = state
        .identities
        .authorizes(&verified.claims.iss, &verified.signed_by)
        .await
        .map_err(AuthError::Unavailable)?;
    if !authorized {
        return Err(AuthError::Unauthorized);
    }

    Ok(AuthenticatedIdentity {
        identity: verified.claims.iss,
        signing_key: verified.signed_by.to_string(),
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
