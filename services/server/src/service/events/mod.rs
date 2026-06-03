pub mod repository;
pub mod rpc;
pub mod tombstone;

use ::entity::event_model as EventModel;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TargetEventKey {
    pub collection: i16,
    pub identity: String,
    pub public_key_type: i16,
    pub public_key: Vec<u8>,
    pub sequence: i64,
}

impl TargetEventKey {
    pub fn of(event: &EventModel::Model) -> Self {
        Self {
            collection: event.collection,
            identity: event.identity.clone(),
            public_key_type: event.public_key_type,
            public_key: event.public_key.clone(),
            sequence: event.sequence,
        }
    }
}
