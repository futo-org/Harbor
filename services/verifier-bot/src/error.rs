//! The error half of every verifier result. Serialized as the JSON body
//! `{ message, extendedMessage }` with `status` (default 500) as the HTTP
//! status, exactly as clients have always received it.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VerifierError {
    pub message: String,
    #[serde(rename = "extendedMessage", skip_serializing_if = "Option::is_none")]
    pub extended_message: Option<String>,
    #[serde(skip)]
    pub status: Option<StatusCode>,
}

pub type VResult<T> = Result<T, VerifierError>;

impl VerifierError {
    /// An error with a user-facing message only. Logged on creation.
    pub fn msg(message: impl Into<String>) -> Self {
        let message = message.into();
        tracing::error!("{message}");
        Self {
            message,
            extended_message: None,
            status: None,
        }
    }

    /// An error with a user-facing message and developer detail. Logged on
    /// creation.
    pub fn new(message: impl Into<String>, extended: impl Into<String>) -> Self {
        let message = message.into();
        let extended = extended.into();
        tracing::error!("{message} ({extended})");
        Self {
            message,
            extended_message: Some(extended),
            status: None,
        }
    }

    pub fn with_status(mut self, status: StatusCode) -> Self {
        self.status = Some(status);
        self
    }

    /// The HTTP status this error is answered with.
    pub fn status_code(&self) -> StatusCode {
        self.status.unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    }

    /// `Invalid claim field type <key>.`, the error every verifier returns
    /// for a field index it doesn't handle.
    pub fn invalid_field(key: i64) -> Self {
        let msg = format!("Invalid claim field type {key}.");
        Self::new(msg.clone(), msg)
    }
}

impl IntoResponse for VerifierError {
    fn into_response(self) -> Response {
        (self.status_code(), axum::Json(&self)).into_response()
    }
}
