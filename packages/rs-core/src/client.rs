use polycentric_common::{
    error::CoreError,
    models::protos_v2::{
        content::ContentBody, ContentDigest, Event, EventBundle, ListEventsResponse, PublicKey,
        SerializedContent, SignedEvent, VectorClock,
    },
};

use crate::store::{content_store::ContentStore, event_store::EventStore, keys::EventKey};
use prost::Message;
use std::collections::HashSet;

const IDENTITY_COLLECTION: i32 = 1;

#[derive(Default)]
pub struct PolycentricClient {
    event_store: EventStore,
    content_store: ContentStore,
}

impl PolycentricClient {
    pub fn new() -> Self {
        Self::default()
    }

    /// Copy a signed event into the event store.
    pub fn copy_event(&mut self, signed_event: SignedEvent) -> Result<EventKey, CoreError> {
        Event::decode(signed_event.event_bytes.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

        let event_key = self.event_store.insert(signed_event.clone())?;

        Ok(event_key)
    }

    /// Copy content bytes into the content store, keyed by digest.
    pub fn copy_content(&mut self, digest: &ContentDigest, content_bytes: Vec<u8>) {
        self.content_store.insert(digest, content_bytes);
    }

    /// Return the next sequence number for a given stream:
    /// max(sequence) + 1 across the (identity, collection, signer) stream,
    /// or 1 if no events exist for that stream.
    pub fn next_sequence(
        &self,
        identity: &str,
        collection: i32,
        signer_key_type: i32,
        signer_key: &[u8],
    ) -> u64 {
        self.event_store
            .by_identity_collection_signer(identity, collection, signer_key_type, signer_key)
            .next_back()
            .map(|(k, _)| k.sequence + 1)
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
        let identity_event_key = EventKey {
            identity: identity.to_string(),
            collection: IDENTITY_COLLECTION,
            signed_by_key_type: current_signer.key_type,
            signed_by_key: current_signer.key.clone(),
            sequence: identity_sequence,
        };
        let identity_signed_event = self.event_store.get(&identity_event_key).ok_or_else(|| {
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
}
