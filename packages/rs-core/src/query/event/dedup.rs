//! Event-bundle deduplication helper shared by every RPC that merges
//! per-server responses (feed, profile, …).

use polycentric_common::models::protos_v2::{Event, EventBundle};
use prost::Message;

/// Tuple that uniquely identifies an `EventBundle` by its underlying
/// `EventKey` (collection, identity, signer, sequence). Used as a
/// `HashSet` key to drop duplicate bundles when the same event comes
/// back from multiple servers.
pub type EventDedupKey = (i32, String, i32, Vec<u8>, u64);

/// Extract the dedup key from `bundle`. Returns `None` when the
/// bundle is missing its signed event or the bytes don't decode —
/// callers typically retain such bundles unconditionally rather than
/// trying to dedupe them.
pub fn event_dedup_key(bundle: &EventBundle) -> Option<EventDedupKey> {
    let signed = bundle.signed_event.as_ref()?;
    let event = Event::decode(signed.event_bytes.as_slice()).ok()?;
    let key = event.key?;
    let signed_by = key.signed_by?;
    Some((
        key.collection,
        key.identity,
        signed_by.key_type,
        signed_by.key,
        key.sequence,
    ))
}
