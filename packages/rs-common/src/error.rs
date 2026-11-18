use crate::platform::error::PlatformError;

/// General error, used by [`Serializable`](crate::models::Serializable) and
/// the v1 model helpers: an IO error or a [`PlatformError`].
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Platform error: {0}")]
    Platform(#[from] PlatformError),
}

/// Error for protocol operations such as opening signed events, resolving
/// vector clocks and verifying merkle proofs.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("Invalid event: {0}")]
    InvalidEvent(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Deserialization error: {0}")]
    DeserializationError(String),

    #[error("Signature error: {0}")]
    SignatureError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Query error: {0}")]
    QueryError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

/// Result with [`Error`].
pub type Result<T> = std::result::Result<T, Error>;
/// Result with [`CoreError`].
pub type CoreResult<T> = std::result::Result<T, CoreError>;
