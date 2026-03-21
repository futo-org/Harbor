use crate::error::Error as TopLevelError;

#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("Key has invalid type: expected {expected}, got {actual}")]
    KeyInvalidType { expected: u64, actual: u64 },

    #[error("Key has incorrect length: expected {expected}, got {actual}")]
    KeyIncorrectLength { expected: usize, actual: usize },

    #[error("Process has invalid length: expected {expected}, got {actual}")]
    ProcessInvalidLength { expected: usize, actual: usize },

    #[error("Signature verification failed")]
    SignatureVerificationFailed,

    #[error("Failed to generate signature: {0}")]
    SignatureGenerationFailed(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Deserialization error: {0}")]
    DeserializationError(String),

    #[error("Crypto operation failed: {0}")]
    CryptoError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),

    #[error("Invalid handle state: {0}")]
    InvalidState(String),

    #[error("Invalid event creation data: {0}")]
    InvalidEventCreationData(String),

    #[error("Query operation failed: {0}")]
    QueryError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Callback error: {0}")]
    CallbackError(String),

    #[error("FFI Error: {0}")]
    FFIError(String),

    #[error("Server error for server {server}: {error}")]
    ServerError { server: String, error: String },
}

pub type PlatformResult<T> = std::result::Result<T, PlatformError>;

#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    Success = 0,

    // Model/Core Errors (100-199)
    KeyInvalidType = 101,
    KeyIncorrectLength = 102,
    ProcessInvalidLength = 103,
    SignatureVerificationFailed = 104,
    SignatureGenerationFailed = 105,
    SerializationError = 106,
    DeserializationError = 107,
    CryptoError = 108,
    InvalidEventCreationData = 109,
    QueryError = 110,
    InvalidInput = 111,
    CallbackError = 112,
    FFIError = 114,
    ServerError = 113,
    Unknown = 199,

    // IO Errors (200-299)
    IoError = 201,

    // Binding Errors (300-399)
    InvalidState = 301,
}

impl From<&TopLevelError> for ErrorCode {
    fn from(error: &TopLevelError) -> Self {
        match error {
            TopLevelError::Io(_) => Self::IoError,
            TopLevelError::Platform(platform_err) => match platform_err {
                PlatformError::KeyInvalidType { .. } => Self::KeyInvalidType,
                PlatformError::KeyIncorrectLength { .. } => Self::KeyIncorrectLength,
                PlatformError::ProcessInvalidLength { .. } => Self::ProcessInvalidLength,
                PlatformError::SignatureVerificationFailed => Self::SignatureVerificationFailed,
                PlatformError::SignatureGenerationFailed(_) => Self::SignatureGenerationFailed,
                PlatformError::SerializationError(_) => Self::SerializationError,
                PlatformError::DeserializationError(_) => Self::DeserializationError,
                PlatformError::CryptoError(_) => Self::CryptoError,
                PlatformError::InvalidState(_) => Self::InvalidState,
                PlatformError::InvalidEventCreationData(_) => Self::InvalidEventCreationData,
                PlatformError::QueryError(_) => Self::QueryError,
                PlatformError::InvalidInput(_) => Self::InvalidInput,
                PlatformError::CallbackError(_) => Self::CallbackError,
                PlatformError::FFIError(_) => Self::FFIError,
                PlatformError::ServerError { .. } => Self::ServerError,
                PlatformError::Unknown(_) => Self::Unknown,
            },
        }
    }
}
