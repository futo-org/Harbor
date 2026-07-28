//! Shared bundle/hint merge and deduplication helpers used by many RPCs

use std::cmp::Reverse;
use std::collections::HashMap;
use std::{cmp, mem};

use polycentric_common::models::protos_v2::{
    Event, EventBundle, EventHint, EventMetadata, ReactionTally,
};
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

    let meta = merge_opt(left.meta, right.meta, merge_bundle_meta);

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
    let reply_count = cmp::max(left.reply_count, right.reply_count);
    let reaction_count = cmp::max(left.reaction_count, right.reaction_count);
    let upvote_count = cmp::max(left.upvote_count, right.upvote_count);
    let downvote_count = cmp::max(left.downvote_count, right.downvote_count);
    let emoji_reactions = merge_reactions(left.emoji_reactions, right.emoji_reactions);

    EventMetadata {
        reply_count,
        reaction_count,
        upvote_count,
        downvote_count,
        emoji_reactions,
    }
}

fn merge_reactions(left: Vec<ReactionTally>, right: Vec<ReactionTally>) -> Vec<ReactionTally> {
    let mut merged = HashMap::<(String, bool), i32>::new();

    // Iterate over all reactions and deduplicate.
    for tally in left.into_iter().chain(right) {
        let key = (tally.emoji, tally.positive);

        merged
            .entry(key)
            .and_modify(|count| *count = cmp::max(*count, tally.count))
            .or_insert(tally.count);
    }

    // Collect back into a vector and sort by most popular.
    let mut merged: Vec<ReactionTally> = merged
        .into_iter()
        .map(|((emoji, positive), count)| ReactionTally {
            emoji,
            positive,
            count,
        })
        .collect();

    merged.sort_unstable_by(|a, b| {
        let left = Reverse((a.count, &a.emoji, a.positive));
        let right = Reverse((b.count, &b.emoji, b.positive));
        left.cmp(&right)
    });

    merged
}

/// Merge an optional value using `merge()` only if both values are present.
fn merge_opt<T, MergeFn: FnOnce(T, T) -> T>(
    left: Option<T>,
    right: Option<T>,
    merge: MergeFn,
) -> Option<T> {
    match (left, right) {
        (Some(left), Some(right)) => Some(merge(left, right)),
        (left, right) => left.or(right),
    }
}
