use polycentric_common::{
    error::CoreError,
    models::protos_v2::{
        content::ContentBody, Content, ContentDigest, Event, EventBundle, PublicKey,
        SerializedContent, SignedEvent, VectorClock,
    },
};

use crate::store::{content_store::ContentStore, event_store::EventStore, keys::EventKey};
use prost::Message;
use std::collections::HashSet;
use std::sync::Mutex;

const IDENTITY_COLLECTION: i32 = 1;

#[derive(Default)]
pub struct PolycentricClient {
    servers: Mutex<Vec<String>>,
    event_store: EventStore,
    content_store: ContentStore,
}

impl PolycentricClient {
    pub fn new() -> Self {
        Self::default()
    }

    /// Replace the list of gRPC servers this client knows about.
    pub fn set_servers(&self, servers: Vec<String>) {
        *self.servers.lock().unwrap() = servers;
    }

    /// Return a snapshot of the configured servers.
    pub fn servers(&self) -> Vec<String> {
        self.servers.lock().unwrap().clone()
    }

    /// Copy a signed event into the event store.
    pub fn copy_event(&mut self, signed_event: SignedEvent) -> Result<(), CoreError> {
        self.event_store.insert(signed_event)
    }

    /// Copy content bytes into the content store, keyed by digest.
    pub fn copy_content(&mut self, digest: &ContentDigest, content_bytes: Vec<u8>) {
        self.content_store.insert(digest, content_bytes);
    }

    /// Find an `EventBundle` in the local stores by (identity,
    /// collection, sequence). Returns the first match — when multiple
    /// signers share the same sequence the choice is arbitrary, so
    /// callers that care about a specific signer should verify the
    /// returned bundle's `event.key.signed_by`. The bundle's
    /// `serialized_content` is populated when the matching content is
    /// also in the content store; otherwise it's left `None`.
    pub fn find_event_bundle_by_sequence(
        &self,
        identity: &str,
        collection: i32,
        sequence: u64,
    ) -> Option<EventBundle> {
        let (_, signed_event) = self
            .event_store
            .by_identity_and_collection(identity, collection)
            .find(|(k, _)| k.sequence == sequence)?;
        let event = Event::decode(signed_event.event_bytes.as_slice()).ok()?;
        let content_bytes = event
            .content_digest
            .as_ref()
            .and_then(|d| self.content_store.get(d))
            .map(|b| b.to_vec());
        Some(EventBundle {
            signed_event: Some(signed_event.clone()),
            serialized_content: content_bytes.map(|c| SerializedContent { content_bytes: c }),
        })
    }

    /// Verify each bundle's signature and copy its event + content
    /// into the local stores.
    pub fn copy_bundles(&mut self, bundles: Vec<EventBundle>) {
        for bundle in bundles {
            let Some(signed_event) = bundle.signed_event else {
                continue;
            };
            if signed_event.verify_signature().is_err() {
                continue;
            }
            let Ok(event) = Event::decode(signed_event.event_bytes.as_slice()) else {
                continue;
            };
            if let (Some(digest), Some(serialized)) =
                (event.content_digest, bundle.serialized_content)
            {
                self.copy_content(&digest, serialized.content_bytes);
            }
            let _ = self.copy_event(signed_event);
        }
    }

    /// Return the next sequence number for a given collection:
    /// max(sequence) + 1 across all events in the collection for an identity,
    /// or 1 if no events exist for that collection.
    pub fn next_sequence(&self, identity: &str, collection: i32) -> u64 {
        self.event_store
            .by_identity_and_collection(identity, collection)
            .map(|(k, _)| k.sequence)
            .max()
            .map(|s| s + 1)
            .unwrap_or(1)
    }

    /// Build a vector clock for a single collection within an identity.
    pub fn build_vector_clock(
        &self,
        identity: &str,
        collection: i32,
        identity_sequence: u64,
        current_signer: &PublicKey,
        current_sequence: u64,
    ) -> Result<VectorClock, CoreError> {
        // Retrieve referenced identity event for this signer.
        let identity_signed_event = self
            .event_store
            .by_identity_and_collection(identity, IDENTITY_COLLECTION)
            .find(|(k, _)| k.sequence == identity_sequence)
            .map(|(_, e)| e)
            .ok_or_else(|| {
                CoreError::InvalidEvent(format!(
                    "No identity event found at sequence {}",
                    identity_sequence
                ))
            })?;

        let identity_event =
            Event::decode(identity_signed_event.event_bytes.as_slice()).map_err(|e| {
                CoreError::InvalidEvent(format!("Failed to decode identity event: {}", e))
            })?;
        let digest = identity_event.content_digest.ok_or_else(|| {
            CoreError::InvalidEvent("Identity event missing content_digest".into())
        })?;

        // Decode the identity content
        let content = self
            .content_store
            .get_decoded(&digest)
            .ok_or_else(|| CoreError::InvalidEvent("Identity content not in store".into()))?;
        let identity_doc = match content.content_body {
            Some(ContentBody::Identity(i)) => i,
            _ => {
                return Err(CoreError::InvalidEvent(
                    "Referenced content is not an Identity".into(),
                ))
            }
        };

        // Iterate rotation_keys + signing_keys (deduped, first-wins)
        //    and collect max observed sequence per signer, overlaying the
        //    caller's current sequence for their own key.
        let current_id = (current_signer.key_type, current_signer.key.as_slice());
        let mut seen = HashSet::new();
        let mut sequence = Vec::new();

        for pk in identity_doc
            .rotation_keys
            .iter()
            .chain(identity_doc.signing_keys.iter())
        {
            let id = (pk.key_type, pk.key.as_slice());
            if !seen.insert(id) {
                continue;
            }

            let height = if id == current_id {
                current_sequence
            } else {
                self.event_store
                    .by_identity_collection_signer(identity, collection, pk.key_type, &pk.key)
                    .next_back()
                    .map(|(k, _)| k.sequence)
                    .unwrap_or(0)
            };
            sequence.push(height);
        }

        Ok(VectorClock { sequence })
    }

    /// Return the bundles (SignedEvent + SerializedContent) for an
    /// (identity, collection) stream, applying CRDT tombstone semantics:
    /// any event whose `EventKey` is targeted by a `Delete` content within
    /// the same collection is excluded.
    ///
    /// Content-type filtering (e.g. "just Follow events") is intentionally
    /// left to the caller — this method only understands `Delete` so it
    /// stays generic across collections.
    pub fn list_valid_events(
        &self,
        identity: &str,
        collection: i32,
    ) -> Result<Vec<EventBundle>, CoreError> {
        let mut bundles: Vec<(EventKey, EventBundle)> = Vec::new();
        let mut tombstoned: HashSet<EventKey> = HashSet::new();

        for (event_key, signed_event) in self
            .event_store
            .by_identity_and_collection(identity, collection)
        {
            let event = Event::decode(signed_event.event_bytes.as_slice())
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            let content_bytes = event
                .content_digest
                .as_ref()
                .and_then(|d| self.content_store.get(d))
                .map(|b| b.to_vec());

            if let Some(bytes) = content_bytes.as_deref() {
                if let Ok(content) = Content::decode(bytes) {
                    if let Some(ContentBody::Delete(d)) = content.content_body {
                        if let Some(target) = d.event_key {
                            if let Some(signed_by) = target.signed_by {
                                tombstoned.insert(EventKey {
                                    identity: target.identity,
                                    collection: target.collection,
                                    signed_by_key_type: signed_by.key_type,
                                    signed_by_key: signed_by.key,
                                    sequence: target.sequence,
                                });
                            }
                        }
                    }
                }
            }

            let bundle = EventBundle {
                signed_event: Some(signed_event.clone()),
                serialized_content: content_bytes.map(|c| SerializedContent { content_bytes: c }),
            };
            bundles.push((event_key.clone(), bundle));
        }

        Ok(bundles
            .into_iter()
            .filter(|(k, _)| !tombstoned.contains(k))
            .map(|(_, b)| b)
            .collect())
    }
}
