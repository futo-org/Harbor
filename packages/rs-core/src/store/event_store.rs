use super::keys::EventKey;
use polycentric_common::{
    error::CoreError,
    models::{protos_v2 as Proto, protos_v2::SignedEvent},
};
use std::{
    collections::{BTreeMap, HashSet, btree_map::Entry},
    ops::Bound,
};

/// In-memory event store.
#[derive(Debug, Default)]
pub struct EventStore {
    events: BTreeMap<EventKey, SignedEvent>,
}

impl EventStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, signed_event: SignedEvent) -> Result<(), CoreError> {
        let event_key = EventKey::from_signed_event(&signed_event)?;
        self.insert_at(signed_event, event_key);
        Ok(())
    }

    /// Try to insert an event using the event key provided instead of deriving it.
    /// No-op when an event with the provided key is already present.
    /// Returns whether an insertion was made.
    pub fn insert_at(&mut self, signed_event: SignedEvent, event_key: EventKey) -> bool {
        match self.events.entry(event_key) {
            Entry::Vacant(slot) => {
                slot.insert(signed_event);
                true
            }
            Entry::Occupied(_) => false,
        }
    }

    /// Point lookup by EventKey.
    pub fn get(&self, key: &EventKey) -> Option<&SignedEvent> {
        self.events.get(key)
    }

    /// Remove an event by its key, returning it if present.
    pub fn remove(&mut self, key: &EventKey) -> Option<SignedEvent> {
        self.events.remove(key)
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
    pub fn by_identity(
        &self,
        identity: &str,
    ) -> impl Iterator<Item = (&EventKey, &SignedEvent)> + use<'_> {
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
    ) -> impl Iterator<Item = (&EventKey, &SignedEvent)> + use<'_> {
        let identity_owned = identity.to_string();
        self.events
            .range(Self::prefix_start(identity, Some(collection), None)..)
            .take_while(move |(k, _)| k.identity == identity_owned && k.collection == collection)
    }

    /// All events for (identity, collection, signer), ordered by sequence, where `sequence` > `sequence_gt`.
    /// Pass in `0` for `sequence_gt` to get the full event stream.
    ///
    /// Returns a `DoubleEndedIterator` so callers can use `.next_back()` to
    /// get the stream's head (max sequence) in O(log n).
    pub fn by_identity_collection_signer(
        &self,
        identity: &str,
        collection: i32,
        signer_key_type: i32,
        signer_key: &[u8],
        sequence_gt: u64,
    ) -> impl DoubleEndedIterator<Item = (&EventKey, &SignedEvent)> + use<'_> {
        let lower = EventKey {
            identity: identity.to_string(),
            collection,
            signed_by_key_type: signer_key_type,
            signed_by_key: signer_key.to_vec(),
            sequence: sequence_gt,
        };
        let upper = EventKey {
            identity: identity.to_string(),
            collection,
            signed_by_key_type: signer_key_type,
            signed_by_key: signer_key.to_vec(),
            sequence: u64::MAX,
        };
        self.events
            .range((Bound::Excluded(lower), Bound::Included(upper)))
    }

    /// Find all collections and signers referenced by the local events.
    /// This does not necessarily include all the reserved collections
    /// one or more of them may be empty.
    /// The set of signers returned may also not match the set of valid
    /// signing keys.
    /// Both sets are derived purely from the collections and signers
    /// actually referenced by the local events for the given identity.
    pub fn find_collections_and_signers(
        &self,
        identity: &str,
    ) -> (Vec<i32>, Vec<Proto::PublicKey>) {
        // Set of collections that we have seen so far
        let mut collections = HashSet::<i32>::new();

        // Set of signers so far, but we do not use `PublicKey` here so that can
        // borrow the key vectors until we know we need to clone
        let mut keys = HashSet::<(i32, &Vec<u8>)>::new();

        // The events are sorted by (identity, collection, signer, sequence number).
        // We will stay within one identity and skip over all the contiguous
        // regions of events where everything is the same except sequence number.
        // Then, we want to record each collection and signer that we see.

        // Lowerbound to pass to the events b-tree to find the next relevant event
        // We start with the lowest event in the sort order for this identity.
        let mut lower = Self::prefix_start(identity, None, None);

        let mut cur_event_key = self.events.range(&lower..).next();

        while let Some((event_key, _)) = cur_event_key {
            // Once we have passed all the events for the specified identity, we are done.
            if event_key.identity != identity {
                break;
            }

            // Ensure the collection and signer in this event key are recorded.
            collections.insert(event_key.collection);
            keys.insert((event_key.signed_by_key_type, &event_key.signed_by_key));

            // Skip the rest of the sequence numbers and get a new signer or collection
            let mut new_event_key = event_key.clone();
            new_event_key.sequence = u64::MAX;
            lower = new_event_key;
            cur_event_key = self
                .events
                .range((Bound::Excluded(&lower), Bound::Unbounded))
                .next();
        }

        (
            collections.into_iter().collect(),
            keys.into_iter()
                .map(|(key_type, signer)| Proto::PublicKey {
                    key_type,
                    key: signer.clone(),
                })
                .collect(),
        )
    }
}
