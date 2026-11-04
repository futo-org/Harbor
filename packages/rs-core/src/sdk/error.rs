//! Errors returned by the Harbor client SDK.

use crate::api::CoreError;

/// Everything that can go wrong in [`crate::sdk::Client`].
///
/// Flat so it crosses the FFI as a tagged error with a message; host
/// facades map the tags they care about onto their own error types.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum SdkError {
    /// Local storage failed (database, blob files, key cipher).
    #[error("Storage: {0}")]
    Storage(String),

    /// A row that must be unique already exists.
    #[error("Already exists: {0}")]
    AlreadyExists(String),

    /// A row that must exist was not found.
    #[error("Not found: {0}")]
    NotFound(String),

    /// The operation needs a signed-in identity.
    #[error("No active identity")]
    NoActiveIdentity,

    /// The operation needs a key pair.
    #[error("No active key pair")]
    NoActiveKeyPair,

    /// The key is not authorized for what was asked of it.
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    /// The server is already on the identity's server list.
    #[error("Server already added")]
    ServerAlreadyAdded,

    /// A network call failed.
    #[error("Network: {0}")]
    Network(String),

    /// Signing, verification or key handling failed.
    #[error("Crypto: {0}")]
    Crypto(String),

    /// Bytes could not be decoded.
    #[error("Decode: {0}")]
    Decode(String),

    /// The caller passed something invalid.
    #[error("Invalid input: {0}")]
    InvalidInput(String),

    /// The protocol engine rejected an operation.
    #[error("Core: {0}")]
    Core(String),

    /// A foreign callback failed.
    #[error("Callback: {0}")]
    Callback(String),
}

impl From<CoreError> for SdkError {
    fn from(e: CoreError) -> Self {
        match e {
            CoreError::Network(m) => SdkError::Network(m),
            CoreError::Crypto(m) => SdkError::Crypto(m),
            CoreError::Decode(m) => SdkError::Decode(m),
            CoreError::InvalidInput(m) => SdkError::InvalidInput(m),
            CoreError::Callback(m) => SdkError::Callback(m),
            CoreError::Store(m) | CoreError::Encode(m) | CoreError::Image(m) => SdkError::Core(m),
        }
    }
}

impl From<polycentric_common::error::CoreError> for SdkError {
    fn from(e: polycentric_common::error::CoreError) -> Self {
        SdkError::Core(format!("{e:?}"))
    }
}

impl From<prost::DecodeError> for SdkError {
    fn from(e: prost::DecodeError) -> Self {
        SdkError::Decode(e.to_string())
    }
}

impl From<rusqlite::Error> for SdkError {
    fn from(e: rusqlite::Error) -> Self {
        if let rusqlite::Error::SqliteFailure(err, _) = &e
            && err.code == rusqlite::ErrorCode::ConstraintViolation
        {
            return SdkError::AlreadyExists(e.to_string());
        }
        SdkError::Storage(e.to_string())
    }
}

impl From<uniffi::UnexpectedUniFFICallbackError> for SdkError {
    fn from(e: uniffi::UnexpectedUniFFICallbackError) -> Self {
        SdkError::Callback(e.reason)
    }
}

pub type SdkResult<T> = Result<T, SdkError>;
