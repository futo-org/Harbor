use polycentric_common::models::protos_v2::{Content, ContentDigest};
use prost::Message;
use std::collections::{BTreeMap, btree_map::Entry};

/// Content digest as a stable map key: (digest type, hash bytes).
type DigestKey = (i32, Vec<u8>);

fn digest_key(digest: &ContentDigest) -> DigestKey {
    (digest.r#type, digest.value.clone())
}

/// In-memory content store keyed by content digest.
#[derive(Debug, Default)]
pub struct ContentStore {
    contents: BTreeMap<DigestKey, Vec<u8>>,
}

impl ContentStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert serialized content bytes keyed by digest.
    /// No-op when an entry with the given digest is already present.
    /// Returns whether an insertion was made.
    pub fn insert(&mut self, digest: &ContentDigest, content_bytes: Vec<u8>) -> bool {
        match self.contents.entry(digest_key(digest)) {
            Entry::Vacant(slot) => {
                slot.insert(content_bytes);
                true
            }
            Entry::Occupied(_) => false,
        }
    }

    /// Get the raw content bytes for a digest.
    pub fn get(&self, digest: &ContentDigest) -> Option<&[u8]> {
        self.contents.get(&digest_key(digest)).map(|v| v.as_slice())
    }

    /// Get and decode a Content proto for a digest.
    pub fn get_decoded(&self, digest: &ContentDigest) -> Option<Content> {
        self.get(digest).and_then(|b| Content::decode(b).ok())
    }
}
