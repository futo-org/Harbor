//! Building the identity document, its wrapped content, and the identity string.

use polycentric_common::models::protos_v2::{
    content::ContentBody, Content, ContentDigest, ContentDigestType, Identity, PublicKey,
};
use prost::Message;
use sha2::{Digest, Sha256};

/// Build an [`Identity`] from ordered rotation and signing keys (no revocations).
pub fn build(rotation_keys: Vec<PublicKey>, signing_keys: Vec<PublicKey>) -> Identity {
    Identity {
        rotation_keys,
        signing_keys,
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    }
}

/// The genesis document for a brand-new identity: a single primary rotation key.
pub fn genesis(primary: PublicKey) -> Identity {
    build(vec![primary], vec![])
}

/// Wrap an identity document in a [`Content`] and serialize it. This is the
/// payload an identity event's `content_digest` is computed over, and what a
/// server would store as `SerializedContent`.
pub fn content_bytes(doc: &Identity) -> Vec<u8> {
    Content {
        content_body: Some(ContentBody::Identity(doc.clone())),
    }
    .encode_to_vec()
}

/// SHA256 [`ContentDigest`] over serialized [`Content`] bytes.
pub fn content_digest(content_bytes: &[u8]) -> ContentDigest {
    ContentDigest {
        r#type: ContentDigestType::Sha256 as i32,
        value: Sha256::digest(content_bytes).to_vec(),
    }
}
