//! Utilities for decoding `Labels` events shipped by the server to clients
//! in the `event_hints` collection of request responses.

use crate::query::event::key::EventKey;
use crate::query::event::merge::EventDedupKey;
use polycentric_common::models::moderation_label::ModerationLabel;
use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, EventHint, GetFeedResponse, GetPostThreadResponse,
    ListNotificationsResponse, SearchPostsResponse, content::ContentBody,
};
use prost::Message;
use std::collections::HashMap;

/// `PostLabel`s are collected by clients for each post.
#[derive(Clone, Debug, PartialEq, Eq, Hash, uniffi::Record)]
pub struct PostLabel {
    pub value: String,
    pub labeled_by: String,
}

impl PostLabel {
    /// Unique identifier for a label, used for deduplication or comparison.
    fn key(&self) -> (&str, &str) {
        (self.value.as_str(), self.labeled_by.as_str())
    }
}

/// Set of all labels applied to some target event.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct LabelSet {
    pub target: EventKey,
    pub labels: Vec<PostLabel>,
}

/// Every moderation label value in canonical order.
#[uniffi::export]
pub fn moderation_labels() -> Vec<String> {
    ModerationLabel::ALL
        .iter()
        .map(|l| l.value().to_string())
        .collect()
}

/// Whether `value` is one of the defined moderation labels.
#[uniffi::export]
pub fn is_moderation_label(value: String) -> bool {
    ModerationLabel::from_value(&value).is_some()
}

/// Union two label sets, deduplicated, and assuming all labels are additive
/// (does not check for labels being deleted).
#[uniffi::export]
pub fn merge_labels(orig: Vec<PostLabel>, latest: Vec<PostLabel>) -> Vec<PostLabel> {
    let mut merged: Vec<PostLabel> = Vec::with_capacity(orig.len() + latest.len());
    for label in orig.into_iter().chain(latest) {
        if merged.iter().any(|kept| kept.key() == label.key()) {
            continue;
        }
        merged.push(label);
    }
    merged
}

/// Whether two label sets differ, ignoring order. Empty and absent are
/// considered equivalent.
#[uniffi::export]
pub fn labels_changed(a: Vec<PostLabel>, b: Vec<PostLabel>) -> bool {
    if a.len() != b.len() {
        return true;
    }
    b.iter()
        .any(|label| !a.iter().any(|other| other.key() == label.key()))
}

/// Decode one hint bundle as a `Labels` event. `None` when the bundle is
/// malformed or carries different content.
fn decode_labels_bundle(bundle: &EventBundle) -> Option<LabelSet> {
    let signed = bundle.signed_event.as_ref()?;
    let content_bytes = &bundle.serialized_content.as_ref()?.content_bytes;
    let content = Content::decode(content_bytes.as_slice()).ok()?;
    let ContentBody::Labels(labels) = content.content_body? else {
        return None;
    };

    let event = Event::decode(signed.event_bytes.as_slice()).ok()?;
    let target = EventKey::from_proto(labels.event_key?)?;
    let labeled_by = event.key.map(|key| key.identity).unwrap_or_default();

    Some(LabelSet {
        labels: labels
            .label_values
            .into_iter()
            .map(|value| PostLabel {
                value,
                labeled_by: labeled_by.clone(),
            })
            .collect(),
        target,
    })
}

/// Every `Labels` event in `hints`, grouped by the event it targets. Hints
/// that aren't labels are skipped. We return a vector type (rather than a
/// map type) because UniFFI does not support non-primitive keys in maps.
pub fn build_label_sets(hints: &[EventHint]) -> Vec<LabelSet> {
    let mut sets: Vec<LabelSet> = Vec::new();
    // Map from event key to an index in `sets`
    let mut index_map: HashMap<EventDedupKey, usize> = HashMap::new();

    for hint in hints {
        let Some(bundle) = hint.event_bundle.as_ref() else {
            continue;
        };
        let Some(set) = decode_labels_bundle(bundle) else {
            continue;
        };

        match index_map.get(&set.target.dedup_key()) {
            Some(&i) => {
                let existing_labels = std::mem::take(&mut sets[i].labels);
                sets[i].labels = merge_labels(existing_labels, set.labels);
            }
            None => {
                index_map.insert(set.target.dedup_key(), sets.len());
                sets.push(set);
            }
        }
    }

    sets
}

/// Return the labels from the `event_hints` field of a feed response
#[uniffi::export]
pub fn labels_from_feed_response(response: Vec<u8>) -> Vec<LabelSet> {
    GetFeedResponse::decode(response.as_slice())
        .map(|r| build_label_sets(&r.event_hints))
        .unwrap_or_default()
}

/// Return the labels from the `event_hints` field of a thread response
#[uniffi::export]
pub fn labels_from_thread_response(response: Vec<u8>) -> Vec<LabelSet> {
    GetPostThreadResponse::decode(response.as_slice())
        .map(|r| build_label_sets(&r.event_hints))
        .unwrap_or_default()
}

/// Return the labels from the `event_hints` field of a list notifications
/// response.
#[uniffi::export]
pub fn labels_from_notifications_response(response: Vec<u8>) -> Vec<LabelSet> {
    ListNotificationsResponse::decode(response.as_slice())
        .map(|r| build_label_sets(&r.event_hints))
        .unwrap_or_default()
}

/// Return the labels from the `event_hints` field of a search posts response.
#[uniffi::export]
pub fn labels_from_search_response(response: Vec<u8>) -> Vec<LabelSet> {
    SearchPostsResponse::decode(response.as_slice())
        .map(|r| build_label_sets(&r.event_hints))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::collections;
    use polycentric_common::models::protos_v2::{
        EventKey as ProtoEventKey, Labels, Notification, PublicKey as ProtoPublicKey, SearchResult,
        SerializedContent, SignedEvent,
    };

    const MODERATOR: &str = "moderatoridentity";
    const AUTHOR: &str = "authoridentity";

    fn label(value: &str, labeled_by: &str) -> PostLabel {
        PostLabel {
            value: value.to_string(),
            labeled_by: labeled_by.to_string(),
        }
    }

    fn proto_key(identity: &str, sequence: u64) -> ProtoEventKey {
        ProtoEventKey {
            collection: collections::FEED,
            identity: identity.to_string(),
            signed_by: Some(ProtoPublicKey {
                key_type: 1,
                key: vec![0xAB],
            }),
            sequence,
        }
    }

    /// A `Labels` event signed by `labeller`, targeting `target`.
    fn labels_bundle(labeller: &str, target: ProtoEventKey, values: &[&str]) -> EventBundle {
        let content = Content {
            content_body: Some(ContentBody::Labels(Labels {
                event_key: Some(target),
                label_values: values.iter().map(|v| v.to_string()).collect(),
            })),
        };
        let event = Event {
            key: Some(ProtoEventKey {
                collection: collections::LABELS,
                identity: labeller.to_string(),
                signed_by: Some(ProtoPublicKey {
                    key_type: 1,
                    key: vec![0xCD],
                }),
                sequence: 1,
            }),
            ..Default::default()
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: Some(SerializedContent {
                content_bytes: content.encode_to_vec(),
            }),
            event_proofs: Vec::new(),
            meta: None,
        }
    }

    /// A bundle carrying something other than labels.
    fn post_bundle(identity: &str) -> EventBundle {
        let content = Content {
            content_body: Some(ContentBody::Post(
                polycentric_common::models::protos_v2::Post {
                    text: "hello".to_string(),
                    ..Default::default()
                },
            )),
        };
        let event = Event {
            key: Some(proto_key(identity, 3)),
            ..Default::default()
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: Some(SerializedContent {
                content_bytes: content.encode_to_vec(),
            }),
            event_proofs: Vec::new(),
            meta: None,
        }
    }

    fn hints(bundles: Vec<EventBundle>) -> Vec<EventHint> {
        bundles
            .into_iter()
            .map(|b| EventHint {
                event_bundle: Some(b),
            })
            .collect()
    }

    #[test]
    fn labels_changed_treats_empty_as_no_labels() {
        assert!(!labels_changed(vec![], vec![]));
    }

    #[test]
    fn labels_changed_ignores_order() {
        let violence = label("violence", MODERATOR);
        let nudity = label("nudity", MODERATOR);
        assert!(!labels_changed(
            vec![violence.clone(), nudity.clone()],
            vec![nudity, violence]
        ));
    }

    #[test]
    fn labels_changed_detects_an_added_label() {
        let violence = label("violence", MODERATOR);
        assert!(labels_changed(
            vec![violence.clone()],
            vec![violence, label("nudity", MODERATOR)]
        ));
    }

    #[test]
    fn labels_changed_detects_the_same_value_from_another_labeller() {
        assert!(labels_changed(
            vec![label("violence", MODERATOR)],
            vec![label("violence", "someothermoderator")]
        ));
    }

    #[test]
    fn merge_labels_unions_deduplicated() {
        let violence = label("violence", MODERATOR);
        let nudity = label("nudity", MODERATOR);
        assert_eq!(
            merge_labels(
                vec![violence.clone()],
                vec![violence.clone(), nudity.clone()]
            ),
            vec![violence, nudity]
        );
    }

    #[test]
    fn merge_labels_keeps_existing_when_the_new_set_is_empty() {
        let violence = label("violence", MODERATOR);
        assert_eq!(
            merge_labels(vec![violence.clone()], vec![]),
            vec![violence.clone()]
        );
        assert_eq!(merge_labels(vec![], vec![violence.clone()]), vec![violence]);
    }

    #[test]
    fn build_label_sets_pairs_a_label_with_its_target() {
        let target = proto_key(AUTHOR, 7);
        let sets = build_label_sets(&hints(vec![labels_bundle(
            MODERATOR,
            target.clone(),
            &["violence", "nudity"],
        )]));

        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].target, EventKey::from_proto(target).unwrap());
        assert_eq!(
            sets[0].labels,
            vec![label("violence", MODERATOR), label("nudity", MODERATOR)]
        );
    }

    #[test]
    fn build_label_sets_skips_bundles_that_are_not_labels() {
        assert!(build_label_sets(&hints(vec![post_bundle(AUTHOR)])).is_empty());
    }

    #[test]
    fn build_label_sets_unions_two_labellers_on_one_target() {
        let target = proto_key(AUTHOR, 7);
        let sets = build_label_sets(&hints(vec![
            labels_bundle(MODERATOR, target.clone(), &["violence"]),
            labels_bundle("secondmoderator", target, &["violence", "hate"]),
        ]));

        assert_eq!(sets.len(), 1);
        assert_eq!(
            sets[0].labels,
            vec![
                label("violence", MODERATOR),
                label("violence", "secondmoderator"),
                label("hate", "secondmoderator"),
            ]
        );
    }

    #[test]
    fn build_label_sets_keeps_targets_apart() {
        let sets = build_label_sets(&hints(vec![
            labels_bundle(MODERATOR, proto_key(AUTHOR, 7), &["violence"]),
            labels_bundle(MODERATOR, proto_key(AUTHOR, 8), &["hate"]),
        ]));

        assert_eq!(sets.len(), 2);
        assert_eq!(sets[0].target.sequence, 7);
        assert_eq!(sets[1].target.sequence, 8);
    }

    #[test]
    fn build_label_sets_drops_a_target_without_a_signer() {
        let target = ProtoEventKey {
            signed_by: None,
            ..proto_key(AUTHOR, 7)
        };
        // A post whose key has no signer never decodes into a post either,
        // so such a label could not be paired with anything.
        assert!(
            build_label_sets(&hints(vec![labels_bundle(
                MODERATOR,
                target,
                &["violence"]
            )]))
            .is_empty()
        );
    }

    #[test]
    fn build_label_sets_drops_undecodable_content() {
        let mut bundle = labels_bundle(MODERATOR, proto_key(AUTHOR, 7), &["violence"]);
        bundle.serialized_content = Some(SerializedContent {
            content_bytes: vec![0xFF, 0xFF, 0xFF],
        });
        assert!(build_label_sets(&hints(vec![bundle])).is_empty());
    }

    #[test]
    fn labels_from_feed_response_reads_the_hints() {
        let response = GetFeedResponse {
            event_bundles: vec![post_bundle(AUTHOR)],
            event_hints: hints(vec![labels_bundle(
                MODERATOR,
                proto_key(AUTHOR, 7),
                &["violence"],
            )]),
            page_info: None,
        }
        .encode_to_vec();

        let sets = labels_from_feed_response(response);
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].labels, vec![label("violence", MODERATOR)]);
    }

    #[test]
    fn labels_from_thread_response_reads_the_hints() {
        let response = GetPostThreadResponse {
            thread: vec![post_bundle(AUTHOR)],
            event_hints: hints(vec![labels_bundle(
                MODERATOR,
                proto_key(AUTHOR, 7),
                &["hate"],
            )]),
        }
        .encode_to_vec();

        let sets = labels_from_thread_response(response);
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].labels, vec![label("hate", MODERATOR)]);
    }

    #[test]
    fn labels_from_notifications_response_reads_the_hints() {
        let response = ListNotificationsResponse {
            notifications: vec![Notification::default()],
            event_hints: hints(vec![labels_bundle(
                MODERATOR,
                proto_key(AUTHOR, 7),
                &["self-harm"],
            )]),
            page_info: None,
        }
        .encode_to_vec();

        let sets = labels_from_notifications_response(response);
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].labels, vec![label("self-harm", MODERATOR)]);
    }

    #[test]
    fn labels_from_search_response_reads_the_hints() {
        // Search puts `event_hints` on a different field number than the
        // feed responses do, so it needs its own decode.
        let response = SearchPostsResponse {
            results: vec![SearchResult {
                event_bundle: Some(post_bundle(AUTHOR)),
                rank: 1.0,
            }],
            event_hints: hints(vec![labels_bundle(
                MODERATOR,
                proto_key(AUTHOR, 7),
                &["violence"],
            )]),
            page_info: None,
        }
        .encode_to_vec();

        let sets = labels_from_search_response(response);
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].labels, vec![label("violence", MODERATOR)]);
    }

    #[test]
    fn labels_from_a_response_that_does_not_decode_are_empty() {
        assert!(labels_from_feed_response(vec![0xFF, 0xFF, 0xFF]).is_empty());
    }
}
