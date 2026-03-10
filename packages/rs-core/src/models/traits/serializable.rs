use crate::error::Result;

pub trait Serializable {
    fn to_bytes(&self) -> Result<Vec<u8>>;

    fn from_bytes(bytes: &[u8]) -> Result<Self>
    where
        Self: Sized;
}
