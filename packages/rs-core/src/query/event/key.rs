//! Event keys as hosts see them: the generated [`EventKey`] and
//! [`PublicKey`] records, plus the helpers the query layer needs.

use crate::query::event::merge::EventDedupKey;
use polycentric_common::models::protos_v2 as proto;

pub use crate::records::{EventKey, PublicKey};

impl EventKey {
    /// Mirror a proto `EventKey`. `None` when it has no signer.
    pub fn from_proto(key: proto::EventKey) -> Option<Self> {
        key.signed_by.as_ref()?;
        Some(key.into())
    }

    /// A key that identifies and deduplicates an event. See
    /// [`event_dedup_key`](crate::query::event::merge::event_dedup_key).
    pub fn dedup_key(&self) -> EventDedupKey {
        let (key_type, key) = self
            .signed_by
            .as_ref()
            .map(|k| (i32::from(k.key_type), k.key.clone()))
            .unwrap_or_default();
        (
            self.collection,
            self.identity.clone(),
            key_type,
            key,
            self.sequence,
        )
    }
}
