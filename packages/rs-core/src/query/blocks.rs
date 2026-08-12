//! Filtering utilities for block events on per-RPC merge functions, mirroring the
//! server's `filter_rows`. Servers already drop blocked content for the caller;
//! redundant block filters on clients cover the case where a server has not seen
//! a block event the client knows about.

use crate::query::event::merge::{EventDedupKey, event_dedup_key};
use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, EventHint, EventKey, content::ContentBody,
};
use prost::Message;
use std::collections::HashSet;

/// Retain only bundles that are neither authored by a blocked identity nor a
/// repost of one.
pub(crate) fn retain_unblocked_bundles(blocked: &HashSet<String>, bundles: &mut Vec<EventBundle>) {
    retain_unblocked(blocked, bundles, false);
}

/// [`retain_unblocked_bundles`], additionally dropping replies whose parent
/// chain contains a dropped post.
pub(crate) fn retain_unblocked_thread_bundles(
    blocked: &HashSet<String>,
    bundles: &mut Vec<EventBundle>,
) {
    retain_unblocked(blocked, bundles, true);
}

/// Retain only hints not authored by a blocked identity. Quote and repost
/// targets travel as hints, and a quote of a blocked identity keeps the
/// quoting post, so only authorship matters here.
pub(crate) fn retain_unblocked_hints(blocked: &HashSet<String>, hints: &mut Vec<EventHint>) {
    if blocked.is_empty() {
        return;
    }

    let before = hints.len();
    hints.retain(|hint| match hint.event_bundle.as_ref() {
        Some(bundle) => !is_blocked_author(blocked, bundle),
        None => true,
    });
    log_dropped("hint", before - hints.len());
}

/// Whether `bundle` is hidden by a block, ignoring reply cascades.
pub(crate) fn is_blocked_bundle(blocked: &HashSet<String>, bundle: &EventBundle) -> bool {
    is_blocked_author(blocked, bundle) || reposts_blocked_target(blocked, bundle)
}

fn retain_unblocked(
    blocked: &HashSet<String>,
    bundles: &mut Vec<EventBundle>,
    cascade_replies: bool,
) {
    if blocked.is_empty() {
        return;
    }

    let before = bundles.len();
    let mut dropped: HashSet<EventDedupKey> = HashSet::new();

    // Replies can precede their parent in the merged list, so cascade until
    // no further bundle is dropped.
    loop {
        let remaining = bundles.len();

        bundles.retain(|bundle| {
            let cascades = cascade_replies
                && reply_parent(bundle)
                    .is_some_and(|parent| blocked.contains(&parent.1) || dropped.contains(&parent));

            if is_blocked_author(blocked, bundle)
                || reposts_blocked_target(blocked, bundle)
                || cascades
            {
                if let Some(key) = event_dedup_key(bundle) {
                    dropped.insert(key);
                }
                return false;
            }

            true
        });

        if bundles.len() == remaining {
            break;
        }
    }

    log_dropped("bundle", before - bundles.len());
}

fn is_blocked_author(blocked: &HashSet<String>, bundle: &EventBundle) -> bool {
    author(bundle).is_some_and(|identity| blocked.contains(&identity))
}

fn reposts_blocked_target(blocked: &HashSet<String>, bundle: &EventBundle) -> bool {
    match content_body(bundle) {
        Some(ContentBody::Repost(repost)) => repost
            .post
            .is_some_and(|target| blocked.contains(&target.identity)),
        _ => false,
    }
}

fn author(bundle: &EventBundle) -> Option<String> {
    let signed_event = bundle.signed_event.as_ref()?;
    let event = Event::decode(signed_event.event_bytes.as_slice()).ok()?;
    Some(event.key?.identity)
}

fn content_body(bundle: &EventBundle) -> Option<ContentBody> {
    let bytes = &bundle.serialized_content.as_ref()?.content_bytes;
    Content::decode(bytes.as_slice()).ok()?.content_body
}

fn reply_parent(bundle: &EventBundle) -> Option<EventDedupKey> {
    match content_body(bundle)? {
        ContentBody::Post(post) => dedup_key(&post.reply?.parent?),
        _ => None,
    }
}

fn dedup_key(key: &EventKey) -> Option<EventDedupKey> {
    let signed_by = key.signed_by.as_ref()?;
    Some((
        key.collection,
        key.identity.clone(),
        signed_by.key_type,
        signed_by.key.clone(),
        key.sequence,
    ))
}

fn log_dropped(kind: &str, count: usize) {
    if count == 0 {
        return;
    }
    crate::logging::log_debug(|| format!("[merge] dropped {count} blocked {kind}(s)"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::{
        Post, PostReply, PublicKey, Repost, SerializedContent, SignedEvent,
    };

    const BLOCKED: &str = "blocked";
    const ALLOWED: &str = "allowed";

    fn blocked_set() -> HashSet<String> {
        HashSet::from([BLOCKED.to_string()])
    }

    fn event_key(identity: &str, sequence: u64) -> EventKey {
        EventKey {
            collection: 2,
            identity: identity.to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![7],
            }),
            sequence,
        }
    }

    fn bundle(key: EventKey, body: ContentBody) -> EventBundle {
        let event = Event {
            key: Some(key),
            ..Default::default()
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: Some(SerializedContent {
                content_bytes: Content {
                    content_body: Some(body),
                }
                .encode_to_vec(),
            }),
            event_proofs: Vec::new(),
            meta: None,
        }
    }

    fn post(identity: &str, sequence: u64) -> EventBundle {
        bundle(
            event_key(identity, sequence),
            ContentBody::Post(Post::default()),
        )
    }

    fn reply(identity: &str, sequence: u64, parent: EventKey) -> EventBundle {
        bundle(
            event_key(identity, sequence),
            ContentBody::Post(Post {
                reply: Some(PostReply {
                    root: Some(parent.clone()),
                    parent: Some(parent),
                }),
                ..Default::default()
            }),
        )
    }

    fn repost(identity: &str, sequence: u64, target: EventKey) -> EventBundle {
        bundle(
            event_key(identity, sequence),
            ContentBody::Repost(Repost { post: Some(target) }),
        )
    }

    fn quote(identity: &str, sequence: u64, target: EventKey) -> EventBundle {
        bundle(
            event_key(identity, sequence),
            ContentBody::Post(Post {
                quote: Some(target),
                ..Default::default()
            }),
        )
    }

    fn authors(bundles: &[EventBundle]) -> Vec<(String, u64)> {
        bundles
            .iter()
            .filter_map(|b| {
                let key = event_dedup_key(b)?;
                Some((key.1, key.4))
            })
            .collect()
    }

    #[test]
    fn drops_bundles_authored_by_blocked_identity() {
        let mut bundles = vec![post(BLOCKED, 1), post(ALLOWED, 2)];
        retain_unblocked_bundles(&blocked_set(), &mut bundles);
        assert_eq!(authors(&bundles), vec![(ALLOWED.to_string(), 2)]);
    }

    #[test]
    fn drops_reposts_of_blocked_target() {
        let mut bundles = vec![repost(ALLOWED, 2, event_key(BLOCKED, 1))];
        retain_unblocked_bundles(&blocked_set(), &mut bundles);
        assert!(bundles.is_empty());
    }

    #[test]
    fn keeps_reposts_of_unblocked_target() {
        let mut bundles = vec![repost(ALLOWED, 2, event_key(ALLOWED, 1))];
        retain_unblocked_bundles(&blocked_set(), &mut bundles);
        assert_eq!(authors(&bundles), vec![(ALLOWED.to_string(), 2)]);
    }

    #[test]
    fn keeps_quotes_of_blocked_target() {
        let mut bundles = vec![quote(ALLOWED, 2, event_key(BLOCKED, 1))];
        retain_unblocked_bundles(&blocked_set(), &mut bundles);
        assert_eq!(authors(&bundles), vec![(ALLOWED.to_string(), 2)]);
    }

    #[test]
    fn drops_hints_authored_by_blocked_identity() {
        let mut hints = vec![
            EventHint {
                event_bundle: Some(post(BLOCKED, 1)),
            },
            EventHint {
                event_bundle: Some(post(ALLOWED, 2)),
            },
        ];
        retain_unblocked_hints(&blocked_set(), &mut hints);
        assert_eq!(hints.len(), 1);
        assert_eq!(
            authors(&[hints[0].event_bundle.clone().unwrap()]),
            vec![(ALLOWED.to_string(), 2)]
        );
    }

    #[test]
    fn keeps_replies_to_blocked_posts_outside_threads() {
        let mut bundles = vec![post(BLOCKED, 1), reply(ALLOWED, 2, event_key(BLOCKED, 1))];
        retain_unblocked_bundles(&blocked_set(), &mut bundles);
        assert_eq!(authors(&bundles), vec![(ALLOWED.to_string(), 2)]);
    }

    #[test]
    fn drops_thread_replies_descending_from_blocked_post() {
        let mut bundles = vec![
            post(ALLOWED, 1),
            post(BLOCKED, 2),
            reply(ALLOWED, 3, event_key(BLOCKED, 2)),
            reply(ALLOWED, 4, event_key(ALLOWED, 3)),
            reply(ALLOWED, 5, event_key(ALLOWED, 1)),
        ];
        retain_unblocked_thread_bundles(&blocked_set(), &mut bundles);
        assert_eq!(
            authors(&bundles),
            vec![(ALLOWED.to_string(), 1), (ALLOWED.to_string(), 5)]
        );
    }

    #[test]
    fn drops_thread_replies_preceding_their_blocked_parent() {
        let mut bundles = vec![
            reply(ALLOWED, 3, event_key(ALLOWED, 2)),
            reply(ALLOWED, 2, event_key(BLOCKED, 1)),
            post(BLOCKED, 1),
        ];
        retain_unblocked_thread_bundles(&blocked_set(), &mut bundles);
        assert!(bundles.is_empty());
    }

    #[test]
    fn drops_thread_replies_whose_blocked_parent_is_absent() {
        // The parent bundle never reaches us in the case of truncated ancestors, a deleted
        // or omit-labeled parent, or a server that has not synced it.
        let mut bundles = vec![
            reply(ALLOWED, 2, event_key(BLOCKED, 1)),
            reply(ALLOWED, 3, event_key(ALLOWED, 2)),
            reply(ALLOWED, 4, event_key(ALLOWED, 9)),
        ];
        retain_unblocked_thread_bundles(&blocked_set(), &mut bundles);
        assert_eq!(authors(&bundles), vec![(ALLOWED.to_string(), 4)]);
    }

    #[test]
    fn drops_thread_replies_to_a_dropped_repost() {
        let mut bundles = vec![
            repost(ALLOWED, 2, event_key(BLOCKED, 1)),
            reply(ALLOWED, 3, event_key(ALLOWED, 2)),
        ];
        retain_unblocked_thread_bundles(&blocked_set(), &mut bundles);
        assert!(bundles.is_empty());
    }

    #[test]
    fn empty_blocked_set_retains_everything() {
        let mut bundles = vec![post(BLOCKED, 1), repost(ALLOWED, 2, event_key(BLOCKED, 1))];
        retain_unblocked_bundles(&HashSet::new(), &mut bundles);
        assert_eq!(bundles.len(), 2);
    }
}
