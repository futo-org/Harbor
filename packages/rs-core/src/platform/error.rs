///
/// Too much of this file is duplicated but we keep running into the orphan rule
/// This should be fixed.
///

#[derive(Debug, thiserror::Error)]
#[cfg(target_arch = "wasm32")]
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

#[cfg(target_arch = "wasm32")]
impl From<PlatformError> for wasm_bindgen::JsValue {
    fn from(error: PlatformError) -> Self {
        js_sys::Error::new(&error.to_string()).into()
    }
}
