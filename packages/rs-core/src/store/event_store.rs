use super::keys::EventKey;
use polycentric_common::{
    error::CoreError,
    models::{protos_v2 as Proto, protos_v2::SignedEvent},
};
use prost::Message;
use std::collections::BTreeMap;

/// In-memory event store.
#[derive(Debug, Default)]
pub struct EventStore {
    events: BTreeMap<EventKey, SignedEvent>,
}

impl EventStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, signed_event: SignedEvent) -> Result<EventKey, CoreError> {
        let event = Proto::Event::decode(signed_event.event_bytes.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

        let event_key = EventKey::from_event(&event)?;

        if self.events.contains_key(&event_key) {
            return Ok(event_key);
        }

        self.events.insert(event_key.clone(), signed_event);

        Ok(event_key)
    }

    /// Point lookup by EventKey.
    pub fn get(&self, key: &EventKey) -> Option<&SignedEvent> {
        self.events.get(key)
    }

    /// Helper function to return the start of the key
    fn prefix_start(
        identity: &str,
        collection: Option<i32>,
        signer: Option<(i32, &[u8])>,
    ) -> EventKey {
        EventKey {
            identity: identity.to_string(),
            collection: collection.unwrap_or(i32::MIN),
            signed_by_key_type: signer.map(|(t, _)| t).unwrap_or(i32::MIN),
            signed_by_key: signer.map(|(_, k)| k.to_vec()).unwrap_or_default(),
            sequence: u64::MIN,
        }
    }

    /// All events for a given identity, ordered by (collection, signer, sequence).
    pub fn by_identity(&self, identity: &str) -> impl Iterator<Item = (&EventKey, &SignedEvent)> {
        let identity_owned = identity.to_string();
        self.events
            .range(Self::prefix_start(identity, None, None)..)
            .take_while(move |(k, _)| k.identity == identity_owned)
    }

    /// All events for (identity, collection), ordered by (signer, sequence).
    pub fn by_identity_and_collection(
        &self,
        identity: &str,
        collection: i32,
    ) -> impl Iterator<Item = (&EventKey, &SignedEvent)> {
        let identity_owned = identity.to_string();
        self.events
            .range(Self::prefix_start(identity, Some(collection), None)..)
            .take_while(move |(k, _)| k.identity == identity_owned && k.collection == collection)
    }

    /// All events for (identity, collection, signer), ordered by sequence.
    ///
    /// Returns a `DoubleEndedIterator` so callers can use `.next_back()` to
    /// get the stream's head (max sequence) in O(log n).
    pub fn by_identity_collection_signer(
        &self,
        identity: &str,
        collection: i32,
        signer_key_type: i32,
        signer_key: &[u8],
    ) -> impl DoubleEndedIterator<Item = (&EventKey, &SignedEvent)> {
        let lower = EventKey {
            identity: identity.to_string(),
            collection,
            signed_by_key_type: signer_key_type,
            signed_by_key: signer_key.to_vec(),
            sequence: u64::MIN,
        };
        let upper = EventKey {
            identity: identity.to_string(),
            collection,
            signed_by_key_type: signer_key_type,
            signed_by_key: signer_key.to_vec(),
            sequence: u64::MAX,
        };
        self.events.range(lower..=upper)
    }
}
