use polycentric_common::models::protos_v2::{Event, PublicKey, VectorClock};
use prost::Message;
use std::collections::BTreeMap;

/// Signer identity: (key_type, raw key bytes).
pub type SignerKey = (i32, Vec<u8>);

/// A decoded head event reduced to the fields needed for vector clock
/// construction.
pub struct HeadEntry {
    pub signer: SignerKey,
    pub collection: i32,
    pub sequence: u64,
}

/// Decode a serialized `Event` into a `HeadEntry`.
pub fn decode_head(bytes: &[u8]) -> Result<HeadEntry, String> {
    let event = Event::decode(bytes).map_err(|e| format!("Failed to decode Event: {e}"))?;
    let event_key = event.key.ok_or("Event missing key")?;
    let signer = event_key.signed_by.ok_or("EventKey missing signed_by")?;

    Ok(HeadEntry {
        signer: (signer.key_type, signer.key),
        collection: event_key.collection,
        sequence: event_key.sequence,
    })
}

/// Build vector clocks from head entries and a caller signer key.
///
/// Returns one `VectorClock` per signer. The caller is always at index 0.
/// Inside each clock, `sequence[0]` = identity collection (1) height,
/// then remaining collections in ascending order.
pub fn build_vector_clocks(
    caller_signed_by: &[u8],
    heads: &[HeadEntry],
) -> Result<Vec<VectorClock>, String> {
    const IDENTITY_COLLECTION: i32 = 1;

    let caller_public_key = PublicKey::decode(caller_signed_by)
        .map_err(|e| format!("Failed to decode signed_by: {e}"))?;
    let caller_signer_key: SignerKey = (caller_public_key.key_type, caller_public_key.key);

    let mut by_signer: BTreeMap<SignerKey, BTreeMap<i32, u64>> = BTreeMap::new();
    let mut collections = BTreeMap::<i32, ()>::new();
    collections.insert(IDENTITY_COLLECTION, ());

    for head in heads {
        collections.insert(head.collection, ());
        by_signer
            .entry(head.signer.clone())
            .or_default()
            .insert(head.collection, head.sequence);
    }

    // Identity first, then remaining collections ascending.
    let collection_order: Vec<i32> = std::iter::once(IDENTITY_COLLECTION)
        .chain(
            collections
                .keys()
                .filter(|&&collection| collection != IDENTITY_COLLECTION)
                .copied(),
        )
        .collect();

    // Caller signer first, then others deterministically.
    let signer_order: Vec<SignerKey> = std::iter::once(caller_signer_key.clone())
        .chain(
            by_signer
                .keys()
                .filter(|key| **key != caller_signer_key)
                .cloned(),
        )
        .collect();

    let mut result = Vec::with_capacity(signer_order.len());
    for signer in &signer_order {
        let empty = BTreeMap::new();
        let heights = by_signer.get(signer).unwrap_or(&empty);
        result.push(VectorClock {
            sequence: collection_order
                .iter()
                .map(|collection| heights.get(collection).copied().unwrap_or(0))
                .collect(),
        });
    }

    Ok(result)
}
