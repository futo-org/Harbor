//! Shared bundle/hint merge and deduplication helpers used by many RPCs

use std::collections::HashMap;
use std::{cmp, mem};

use polycentric_common::models::protos_v2::{Event, EventBundle, EventHint, EventMetadata};
use prost::Message;

use crate::query::validation::{retain_validated_bundles, retain_validated_hints};

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

/// Responses carrying a flat `event_bundles` list.
pub trait EventBundleResponse: Message + Default {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle>;
    fn hints_mut(&mut self) -> &mut Vec<EventHint>;
}

/// Concatenate per-server bundles, merge by `EventKey`, drop invalid ones.
pub fn merge_bundle_responses<T: EventBundleResponse>(
    values: &[Vec<u8>],
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = T::default();
    for v in values {
        if let Ok(mut incoming) = T::decode(v.as_slice()) {
            merged.bundles_mut().append(incoming.bundles_mut());
            merged.hints_mut().append(incoming.hints_mut());
        }
    }

    merge_event_bundles(merged.bundles_mut());
    merge_event_hints(merged.hints_mut());

    {
        let c = client.lock().unwrap();
        retain_validated_bundles(&c, merged.bundles_mut());
        retain_validated_hints(&c, merged.hints_mut());
    }

    merged.encode_to_vec()
}

/// Assume the event keys are the same and merge data.
pub fn merge_bundle(left: EventBundle, right: EventBundle) -> EventBundle {
    let signed_event = left.signed_event.or(right.signed_event);
    let serialized_content = left.serialized_content.or(right.serialized_content);

    // TODO: smarter event proof merge
    let event_proofs = if !left.event_proofs.is_empty() {
        left.event_proofs
    } else {
        right.event_proofs
    };

    let meta = match (left.meta, right.meta) {
        (Some(left), Some(right)) => Some(merge_bundle_meta(left, right)),
        _ => left.meta.or(right.meta),
    };

    EventBundle {
        signed_event,
        serialized_content,
        event_proofs,
        meta,
    }
}

/// Deduplicate `bundles`, merging all bundles that have the same event key.
/// This function does *not* validate the bundles.
pub fn merge_event_bundles(bundles: &mut Vec<EventBundle>) {
    let original: Vec<EventBundle> = mem::take(bundles);

    // Maps an event key to an index in `merged`.
    // We use a vec + hashmap to maintain item ordering.
    let mut index: HashMap<EventDedupKey, usize> = HashMap::new();

    for bundle in original {
        match event_dedup_key(&bundle) {
            Some(k) => match index.get(&k) {
                Some(&i) => {
                    let existing = mem::take(&mut bundles[i]);
                    bundles[i] = merge_bundle(existing, bundle);
                }
                None => {
                    index.insert(k, bundles.len());
                    bundles.push(bundle);
                }
            },
            None => bundles.push(bundle),
        }
    }
}

/// Deduplicate `hints`, merging all hints that have the same event key.
/// Hints without a bundle are dropped.
/// This function does *not* validate the bundles.
pub fn merge_event_hints(hints: &mut Vec<EventHint>) {
    let original = mem::take(hints);
    let mut hint_bundles = original
        .into_iter()
        .filter_map(|h| h.event_bundle)
        .collect();

    merge_event_bundles(&mut hint_bundles);

    *hints = hint_bundles
        .into_iter()
        .map(|b| EventHint {
            event_bundle: Some(b),
        })
        .collect();
}

fn merge_bundle_meta(left: EventMetadata, right: EventMetadata) -> EventMetadata {
    let reply_count = match (left.reply_count, right.reply_count) {
        (Some(left), Some(right)) => Some(cmp::max(left, right)),
        _ => left.reply_count.or(right.reply_count),
    };

    EventMetadata { reply_count }
}
