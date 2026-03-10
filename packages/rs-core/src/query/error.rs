use std::fmt;

/// Query-specific error types
#[derive(Debug, Clone)]
pub enum QueryError {
    /// Event not found
    EventNotFound(String),
    /// Invalid query parameters
    InvalidQuery(String),
    /// Invalid reference format
    InvalidReference(String),
    /// Invalid cursor format or data
    InvalidCursor(String),
    /// CRDT operation failed
    CRDTError(String),
    /// Storage error
    StorageError(String),
    /// Serialization/deserialization error
    SerializationError(String),
    /// General query error
    General(String),
}

impl fmt::Display for QueryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            QueryError::EventNotFound(msg) => write!(f, "Event not found: {}", msg),
            QueryError::InvalidQuery(msg) => write!(f, "Invalid query: {}", msg),
            QueryError::InvalidReference(msg) => write!(f, "Invalid reference: {}", msg),
            QueryError::InvalidCursor(msg) => write!(f, "Invalid cursor: {}", msg),
            QueryError::CRDTError(msg) => write!(f, "CRDT error: {}", msg),
            QueryError::StorageError(msg) => write!(f, "Storage error: {}", msg),
            QueryError::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            QueryError::General(msg) => write!(f, "Query error: {}", msg),
        }
    }
}

impl std::error::Error for QueryError {}

pub type QueryResult<T> = Result<T, QueryError>;
