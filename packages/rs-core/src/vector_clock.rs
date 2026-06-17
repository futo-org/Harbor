use polycentric_common::{
    error::CoreError,
    models::protos_v2::{Identity, PublicKey, VectorClock},
};

use crate::store::event_store::EventStore;

/// Structural check against the identity doc + every non-self non-zero
/// entry must reference an event we've seen from that co-signer.
pub fn verify_vector_clock(
    store: &EventStore,
    vc: &VectorClock,
    doc: &Identity,
    identity: &str,
    collection: i32,
    signer: &PublicKey,
    expected_self_sequence: u64,
) -> Result<(), CoreError> {
    let self_position = vc.get_signer_position(doc, signer, expected_self_sequence)?;
    let dedup = doc.deduplicated_keys();
    for (pos, &observed) in vc.sequence.iter().enumerate() {
        if pos == self_position || observed == 0 {
            continue;
        }
        let other = dedup[pos];
        let seen = store
            .by_identity_collection_signer(identity, collection, other.key_type, &other.key, 0)
            .any(|(k, _)| k.sequence == observed);
        if !seen {
            return Err(CoreError::InvalidEvent(format!(
                "vector_clock references unseen event from co-signer at sequence {}",
                observed
            )));
        }
    }
    Ok(())
}
