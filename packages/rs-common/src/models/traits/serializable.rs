//! The [`Serializable`] trait.

use crate::error::Result;

/// Protobuf encoding with errors mapped to [`Error`](crate::error::Error).
pub trait Serializable {
    /// Encode `self` as protobuf bytes.
    fn to_bytes(&self) -> Result<Vec<u8>>;

    /// Decode a value from protobuf bytes.
    fn from_bytes(bytes: &[u8]) -> Result<Self>
    where
        Self: Sized;
}
