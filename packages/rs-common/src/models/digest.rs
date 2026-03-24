use crate::models::{Digest, protos::digest::DigestType};

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
