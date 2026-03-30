use sha2::{Digest, Sha256};
use std::fmt;

// Matches ContentDigestType enum in content.proto
const CONTENT_DIGEST_TYPE_SHA256: i32 = 1;

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

/// Verify that the digest matches the SHA256 of the content bytes.
pub fn verify_content_digest(
    digest_type: i32,
    expected_digest: &[u8],
    content_bytes: &[u8],
) -> Result<(), DigestError> {
    match digest_type {
        CONTENT_DIGEST_TYPE_SHA256 => {
            let mut hasher = Sha256::new();
            hasher.update(content_bytes);
            let computed = hasher.finalize();

            if computed.as_slice() == expected_digest {
                Ok(())
            } else {
                Err(DigestError::Mismatch)
            }
        }
        other => Err(DigestError::UnsupportedDigestType(other)),
    }
}
