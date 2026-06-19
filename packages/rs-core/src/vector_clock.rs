use polycentric_common::{
    error::CoreError,
    models::protos_v2::{EventKey, Identity, PublicKey, VectorClock},
};

use crate::store::event_store::EventStore;

/// Check a vector clock against the identity doc.
///
/// Returns `Err` if the clock is structurally invalid (wrong length, unknown
/// signer, or a self entry that doesn't match the event's sequence).
///
/// Returns `Ok(missing)` with the referenced events from the identity's other
/// keys that we haven't synced. A missing event does not make the referencing
/// event invalid — it's just an event to fetch. Building the identity chain
/// needs `missing` empty; content readers keep the event either way.
pub fn verify_vector_clock(
    store: &EventStore,
    vc: &VectorClock,
    doc: &Identity,
    identity: &str,
    collection: i32,
    signer: &PublicKey,
    expected_self_sequence: u64,
) -> Result<Vec<EventKey>, CoreError> {
    let self_position = vc.get_signer_position(doc, signer, expected_self_sequence)?;
    let dedup = doc.deduplicated_keys();
    let mut missing = Vec::new();
    for (pos, &observed) in vc.sequence.iter().enumerate() {
        if pos == self_position || observed == 0 {
            continue;
        }
        let other = dedup[pos];
        let seen = store
            .by_identity_collection_signer(identity, collection, other.key_type, &other.key, 0)
            .any(|(k, _)| k.sequence == observed);
        if !seen {
            missing.push(EventKey {
                collection,
                identity: identity.to_string(),
                signed_by: Some(other.clone()),
                sequence: observed,
            });
        }
    }
    Ok(missing)
}
