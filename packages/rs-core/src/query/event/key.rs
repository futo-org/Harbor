//! FFI-friendly mirrors of the proto `EventKey` and `PublicKey`
//! messages in the protocol.

use crate::query::event::merge::EventDedupKey;
use polycentric_common::models::protos_v2 as proto;

#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct PublicKey {
    pub key_type: i32,
    pub key: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct EventKey {
    pub collection: i32,
    pub identity: String,
    pub signed_by: PublicKey,
    pub sequence: u64,
}

impl EventKey {
    /// Mirror a proto `EventKey`. `None` when it has no signer.
    pub fn from_proto(key: proto::EventKey) -> Option<Self> {
        let signed_by = key.signed_by?;
        Some(Self {
            collection: key.collection,
            identity: key.identity,
            signed_by: PublicKey {
                key_type: signed_by.key_type,
                key: signed_by.key,
            },
            sequence: key.sequence,
        })
    }

    /// A key that identifies and deduplicates an event. See
    /// [`event_dedup_key`](crate::query::event::merge::event_dedup_key).
    pub fn dedup_key(&self) -> EventDedupKey {
        (
            self.collection,
            self.identity.clone(),
            self.signed_by.key_type,
            self.signed_by.key.clone(),
            self.sequence,
        )
    }
}

impl From<PublicKey> for proto::PublicKey {
    fn from(k: PublicKey) -> Self {
        Self {
            key_type: k.key_type,
            key: k.key,
        }
    }
}

impl From<EventKey> for proto::EventKey {
    fn from(k: EventKey) -> Self {
        Self {
            collection: k.collection,
            identity: k.identity,
            signed_by: Some(k.signed_by.into()),
            sequence: k.sequence,
        }
    }
}
