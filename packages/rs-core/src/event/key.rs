//! FFI-friendly mirrors of the proto `EventKey` and `PublicKey`
//! messages. The proto types live in rs-common which can't pull in
//! uniffi (server consumes it too); these records bridge the FFI
//! surface and `Into` the proto types when an RPC needs them.

use polycentric_common::models::protos_v2 as proto;

#[derive(Clone, Debug, uniffi::Record)]
pub struct PublicKey {
    pub key_type: i32,
    pub key: Vec<u8>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct EventKey {
    pub collection: i32,
    pub identity: String,
    pub signed_by: PublicKey,
    pub sequence: u64,
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
