use crate::encode_hex;
use crate::models::protos_v2::ContentDigest;
use crate::models::{Digest, protos::digest::DigestType};
use std::fmt;

impl Digest {
    pub fn compute(bytes: &[u8]) -> Digest {
        let mut hasher = ::hmac_sha256::Hash::new();
        hasher.update(bytes);

        Digest {
            digest_type: DigestType::Sha256 as u64,
            digest: hasher.finalize().to_vec(),
        }
    }
}

impl fmt::Debug for ContentDigest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ContentDigest { r#type: _, value } = self;
        f.debug_struct("ContentDigest")
            .field("type", &self.r#type())
            .field("value", &encode_hex(value))
            .finish()
    }
}
