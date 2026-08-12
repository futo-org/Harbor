use core::fmt;

use crate::models::protos_v2::{ContentDigest, ContentDigestType};

#[derive(Debug)]
pub enum DigestError {
    UnsupportedDigestType(i32),
    Mismatch,
}

impl fmt::Display for DigestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DigestError::UnsupportedDigestType(t) => {
                write!(f, "unsupported content digest type: {t}")
            }
            DigestError::Mismatch => write!(f, "content digest does not match"),
        }
    }
}

/// Verify content bytes against the provided digest bytes.
pub fn verify_digest(digest_type: i32, digest: &[u8], bytes: &[u8]) -> Result<(), DigestError> {
    use sha2::{Digest, Sha256};

    match digest_type {
        _ if digest_type == ContentDigestType::Sha256 as i32 => {
            let derived = Sha256::digest(bytes);

            if derived.as_slice() == digest {
                Ok(())
            } else {
                Err(DigestError::Mismatch)
            }
        }
        _ => Err(DigestError::UnsupportedDigestType(digest_type)),
    }
}

impl ContentDigest {
    /// Encode this content digest as a single string.
    pub fn to_id(&self) -> String {
        format!("{}_{}", self.r#type, hex::encode(self.value.as_slice()))
    }

    /// Decode a content digest from a content digest id string.
    pub fn from_id(id: &str) -> Option<Self> {
        let (type_str, hex_str) = id.split_once('_')?;
        let r#type = type_str.parse::<i32>().ok()?;
        let value = hex::decode(hex_str).ok()?;
        Some(Self { r#type, value })
    }

    /// Verify this content digest against `content_bytes` to see if they match.
    pub fn verify_against(&self, content_bytes: &[u8]) -> Result<(), DigestError> {
        verify_digest(self.r#type, &self.value, content_bytes)
    }
}

impl fmt::Debug for ContentDigest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ContentDigest { r#type: _, value } = self;
        f.debug_struct("ContentDigest")
            .field("type", &self.r#type())
            .field("value", &hex::encode(value))
            .finish()
    }
}
