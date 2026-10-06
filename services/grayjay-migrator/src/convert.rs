//! Map a legacy system's v1 events to the v2 content events to re-sign.
//!
//! Grayjay posts and reactions are about **URLs** (a post is a comment on a
//! video/page), so they map onto v2's out-of-network attribution types:
//! - `POST`   -> `Post { text, attributed_to: [Link{url}], links: [rich Link] }` (`FEED`)
//! - `OPINION`-> `AttributedToReaction { attributed_to: Link{url}, positive }`
//!   when it targets a URL, or `Reaction { event_key, positive }` when it
//!   targets an in-network (migrated) post (`INTERACTIONS`)
//! - `USERNAME`/`DESCRIPTION` -> `ProfileUpdate` (`PROFILE`)
//! - `FOLLOW` -> `Follow { identity }` (`SOCIAL_GRAPH`), latest add/remove wins
//!
//! Conversion runs in two phases so that replies can reference the *migrated*
//! posts and links can carry a rich preview:
//! 1. [`plan`] turns a system's events into ordered [`PlanItem`]s. Posts are
//!    left deferred ([`PlanBody::Post`]) because their reply target and link
//!    preview aren't resolvable until every system has been planned.
//! 2. [`finalize_post`] serializes a deferred post once the global
//!    legacy->v2 [`EventKey`] map and the link-preview cache are available.
//!
//! Opinions are a v1 CRDT and are de-duplicated per target URL: only the latest
//! state is emitted, and a retracted (REMOVE) opinion emits nothing.
//!
//! Deferred (documented extension points): images/avatars (need the v2
//! blob-upload flow), and claims (`CLAIM` -> `VerificationClaim`).

use std::collections::HashMap;

use polycentric_common::models::collections;
use polycentric_common::models::protos::Post as LegacyPost;
use polycentric_common::models::protos_v2::{
    AttributedTo, AttributedToReaction, Content, EventKey, Follow, Link, Post, PostReply,
    ProfileUpdate, Reaction, attributed_to, content::ContentBody,
};
use prost::Message;

use crate::legacy::{LegacyEvent, LegacyOpinion, LegacyReference, OpinionTarget, TargetPointer};

// v1 ContentType values (protos/polycentric.proto).
const CT_POST: i64 = 3;
const CT_FOLLOW: i64 = 4;
const CT_USERNAME: i64 = 5;
const CT_DESCRIPTION: i64 = 6;
const CT_OPINION: i64 = 14;

// v1 Reference.ReferenceType::Bytes - carries the topic URL bytes.
const REF_BYTES: i64 = 3;

// v1 Opinion enum values (protos/polycentric.proto): the byte stored in the
// opinion's `LWWElement.value`.
const OPINION_LIKE: &[u8] = &[1];
const OPINION_DISLIKE: &[u8] = &[2];
const OPINION_NEUTRAL: &[u8] = &[3];

/// A planned v2 content event, before final serialization.
pub struct PlanItem {
    pub collection: i32,
    pub created_at: u64,
    /// Legacy event pointer this came from (`None` for synthesized content).
    pub source: Option<String>,
    /// Legacy v1 `ContentType` of the source (0 if synthesized).
    pub content_type: i64,
    /// Legacy moderation verdict/tags carried forward (posts only), so the new
    /// moderation service can skip re-scoring. `None` for synthesized content.
    pub moderation_status: Option<String>,
    pub moderation_tags: Option<String>,
    pub body: PlanBody,
}

/// Either already-serialized content, or something to serialize once the global
/// reply map (and link-preview cache) exist.
pub enum PlanBody {
    Ready(Vec<u8>),
    Post(PostPlan),
    /// An in-network reaction to a post migrated from another (or the same)
    /// legacy system; resolved against the global map in phase 2.
    Reaction(ReactionPlan),
    /// An out-of-network reaction on a topic URL; its `attributed_to` link is
    /// unfurled (via the shared URL-info cache) in phase 2, like a post's.
    AttributedReaction {
        url: String,
        positive: bool,
    },
    /// A follow of another system; its followed identity is derived in phase 2.
    Follow {
        followed_key: Vec<u8>,
    },
}

/// A vote on an in-network post, resolved to the migrated post's `EventKey` in
/// phase 2.
pub struct ReactionPlan {
    pub target: TargetPointer,
    pub positive: bool,
}

/// A post whose reply target and link preview are resolved in phase 2.
pub struct PostPlan {
    pub text: String,
    /// Topic(s) the post commented on (the video/page URL, or a legacy id ref).
    pub topics: Vec<Topic>,
    /// The parent post this replies to, if any.
    pub reply_target: Option<TargetPointer>,
}

/// A topic reference resolved to an attribution URL. Grayjay stores the
/// commented-on resource as a full `http(s)` URL (the vast majority), a
/// non-http scheme URI (e.g. `lbry://…`), or a bare platform id (a YouTube
/// video id, a Rumble slug, a `video_episode:<uuid>`, …). We always keep an
/// attribution and note whether it's a web URL we can unfurl into a preview.
pub struct Topic {
    /// The URL to attribute the post/reaction to.
    pub url: String,
    /// True for `http(s)` URLs we can unfurl into a rich `links` preview.
    pub previewable: bool,
}

/// The plan for one system's migration.
pub struct SystemPlan {
    pub items: Vec<PlanItem>,
    pub genesis_created_at: u64,
}

/// The latest opinion a system holds on one target URL.
struct OpinionState {
    timestamp: u64,
    positive: bool,
    retracted: bool,
    pointer: String,
}

/// Phase 1: plan a system's v1 content into ordered v2 content items. `events`
/// are the non-opinion events; `opinions` are the pre-deduplicated latest
/// opinions (read from the server's latest-reference tables).
pub fn plan(events: &[LegacyEvent], opinions: &[LegacyOpinion]) -> SystemPlan {
    let genesis_created_at = events
        .iter()
        .map(|e| e.unix_milliseconds)
        .chain(opinions.iter().map(|o| o.unix_milliseconds))
        .min()
        .unwrap_or(0);

    let mut items = Vec::new();

    let mut latest_name: Option<(u64, String)> = None;
    let mut latest_description: Option<(u64, String)> = None;
    // Opinions split by target: a topic URL (out-of-network) vs. an in-network
    // post pointer. Each is last-write-wins per target.
    let mut url_opinions: HashMap<String, OpinionState> = HashMap::new();
    let mut post_opinions: HashMap<(String, String), OpinionState> = HashMap::new();
    // Latest follow/unfollow per followed system: (timestamp, is_active, pointer).
    let mut follows: HashMap<Vec<u8>, (u64, bool, String)> = HashMap::new();

    for event in events {
        match event.content_type {
            CT_POST => {
                if let Ok(legacy) = LegacyPost::decode(event.content.as_slice()) {
                    items.push(PlanItem {
                        collection: collections::FEED,
                        created_at: event.unix_milliseconds,
                        source: Some(event.pointer()),
                        content_type: CT_POST,
                        moderation_status: event.moderation_status.clone(),
                        moderation_tags: event.moderation_tags.clone(),
                        body: PlanBody::Post(PostPlan {
                            text: legacy.content,
                            topics: topics(&event.references),
                            reply_target: event.pointer_target(),
                        }),
                    });
                }
            }
            CT_FOLLOW => {
                if let Some(f) = &event.follow {
                    let entry = follows.entry(f.followed_key.clone()).or_default();
                    if f.unix_ms >= entry.0 {
                        *entry = (f.unix_ms, f.add, event.pointer());
                    }
                }
            }
            CT_USERNAME => update_latest(&mut latest_name, event),
            CT_DESCRIPTION => update_latest(&mut latest_description, event),
            // TODO: CT_AVATAR (9), CT_CLAIM (12) - see module docs.
            _ => {}
        }
    }

    // Opinions arrive pre-deduplicated (latest per target); fold each into the
    // per-target map, which also collapses cross-form URL duplicates.
    for opinion in opinions {
        record_opinion(&mut url_opinions, &mut post_opinions, opinion);
    }

    // One reaction per target whose latest opinion still stands. URL targets
    // become out-of-network `AttributedToReaction`s (ready now); post targets
    // become in-network `Reaction`s resolved in phase 2. Ordered by (time,
    // source) for stable, deterministic sequencing across re-runs.
    let mut reaction_items: Vec<(u64, String, PlanItem)> = Vec::new();
    for (url, o) in url_opinions.into_iter().filter(|(_, o)| !o.retracted) {
        reaction_items.push((
            o.timestamp,
            o.pointer.clone(),
            PlanItem {
                collection: collections::INTERACTIONS,
                created_at: o.timestamp,
                source: Some(o.pointer),
                content_type: CT_OPINION,
                // Reactions aren't content-moderated; nothing to carry forward.
                moderation_status: None,
                moderation_tags: None,
                body: PlanBody::AttributedReaction {
                    url,
                    positive: o.positive,
                },
            },
        ));
    }
    for ((system_hex, pointer), o) in post_opinions.into_iter().filter(|(_, o)| !o.retracted) {
        reaction_items.push((
            o.timestamp,
            o.pointer.clone(),
            PlanItem {
                collection: collections::INTERACTIONS,
                created_at: o.timestamp,
                source: Some(o.pointer),
                content_type: CT_OPINION,
                moderation_status: None,
                moderation_tags: None,
                body: PlanBody::Reaction(ReactionPlan {
                    target: TargetPointer {
                        system_hex,
                        pointer,
                    },
                    positive: o.positive,
                }),
            },
        ));
    }
    reaction_items.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    for (_, _, item) in reaction_items {
        items.push(item);
    }

    // Active follows only, ordered by (time, pointer) for stable sequencing.
    let mut follow_items: Vec<(u64, String, Vec<u8>)> = follows
        .into_iter()
        .filter(|(_, (_, active, _))| *active)
        .map(|(key, (ts, _, ptr))| (ts, ptr, key))
        .collect();
    follow_items.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    for (ts, pointer, followed_key) in follow_items {
        items.push(PlanItem {
            collection: collections::SOCIAL_GRAPH,
            created_at: ts,
            source: Some(pointer),
            content_type: CT_FOLLOW,
            moderation_status: None,
            moderation_tags: None,
            body: PlanBody::Follow { followed_key },
        });
    }

    if latest_name.is_some() || latest_description.is_some() {
        let created_at = latest_name
            .as_ref()
            .map(|(t, _)| *t)
            .max(latest_description.as_ref().map(|(t, _)| *t))
            .unwrap_or(genesis_created_at);
        let profile = Content {
            content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
                name: latest_name.map(|(_, v)| v),
                avatar: None,
                banner: None,
                description: latest_description.map(|(_, v)| v),
                alias: None,
            })),
        };
        items.push(PlanItem {
            collection: collections::PROFILE,
            created_at,
            // Synthetic, stable per-system pointer so the aggregated profile is
            // recorded in `migrated_event` (there's no single legacy source
            // event - it's folded from all username/description events).
            source: Some("profile".to_string()),
            content_type: CT_USERNAME,
            moderation_status: None,
            moderation_tags: None,
            body: PlanBody::Ready(profile.encode_to_vec()),
        });
    }

    SystemPlan {
        items,
        genesis_created_at,
    }
}

/// Phase 2: serialize a deferred post, resolving its reply target against the
/// global legacy->v2 map and attaching a resolved rich link (`links`) plus the
/// topic attribution (`attributed_to`).
pub fn finalize_post(
    plan: &PostPlan,
    reply_map: &HashMap<(String, String), EventKey>,
    resolved_links: &[Link],
) -> Vec<u8> {
    let reply = plan.reply_target.as_ref().and_then(|t| {
        reply_map
            .get(&(t.system_hex.clone(), t.pointer.clone()))
            .map(|ek| PostReply {
                // Best effort: link parent and root to the resolved parent. The
                // app threads on parentId, so replies still nest correctly.
                root: Some(ek.clone()),
                parent: Some(ek.clone()),
            })
    });

    Content {
        content_body: Some(ContentBody::Post(Post {
            text: plan.text.clone(),
            reply,
            images: vec![],
            quote: None,
            links: resolved_links.to_vec(),
            labels: vec![],
            attributed_to: plan.topics.iter().map(|t| url_link(&t.url)).collect(),
        })),
    }
    .encode_to_vec()
}

/// Fold one deduplicated v1 opinion into the latest-state map for its target.
///
/// The value is an `Opinion` enum byte - `LIKE`/`DISLIKE`/`NEUTRAL`; `NEUTRAL`
/// retracts a prior like/dislike. The target is either a topic URL (Bytes ->
/// out-of-network `AttributedToReaction`) or an in-network post (Pointer ->
/// `Reaction`). A Bytes target is classified/normalized the same way post
/// topics are, so cross-form URL duplicates still collapse. Returns `false` if
/// the value is unknown or a Bytes target isn't valid UTF-8.
fn record_opinion(
    url_opinions: &mut HashMap<String, OpinionState>,
    post_opinions: &mut HashMap<(String, String), OpinionState>,
    opinion: &LegacyOpinion,
) -> bool {
    let (positive, retracted) = match opinion.value.as_slice() {
        OPINION_LIKE => (true, false),
        OPINION_DISLIKE => (false, false),
        OPINION_NEUTRAL => (false, true),
        _ => return false, // UNSPECIFIED / unknown
    };
    let ts = opinion.unix_milliseconds;
    let source = opinion.source_pointer();
    match &opinion.target {
        OpinionTarget::Bytes(bytes) => {
            let Ok(raw) = std::str::from_utf8(bytes) else {
                return false;
            };
            let url = classify_topic(raw).url;
            upsert_opinion(url_opinions, url, ts, positive, retracted, source);
            true
        }
        OpinionTarget::Pointer(target) => {
            upsert_opinion(
                post_opinions,
                (target.system_hex.clone(), target.pointer.clone()),
                ts,
                positive,
                retracted,
                source,
            );
            true
        }
    }
}

/// Keep the latest opinion (by timestamp) for a target key.
fn upsert_opinion<K: std::hash::Hash + Eq>(
    map: &mut HashMap<K, OpinionState>,
    key: K,
    timestamp: u64,
    positive: bool,
    retracted: bool,
    pointer: String,
) {
    if map.get(&key).is_none_or(|cur| timestamp >= cur.timestamp) {
        map.insert(
            key,
            OpinionState {
                timestamp,
                positive,
                retracted,
                pointer,
            },
        );
    }
}

/// Phase 2: serialize a deferred in-network reaction, resolving its target post
/// against the global legacy->v2 map. Returns `None` if the target post was not
/// migrated (so the reaction is dropped).
pub fn finalize_reaction(
    plan: &ReactionPlan,
    reply_map: &HashMap<(String, String), EventKey>,
) -> Option<Vec<u8>> {
    let event_key = reply_map
        .get(&(plan.target.system_hex.clone(), plan.target.pointer.clone()))?
        .clone();
    Some(
        Content {
            content_body: Some(ContentBody::Reaction(Reaction {
                event_key: Some(event_key),
                emoji: Some(vote_emoji(plan.positive)),
                positive: plan.positive,
            })),
        }
        .encode_to_vec(),
    )
}

/// v1 up/down votes default to Harbor's thumbs-up / thumbs-down emoji.
fn vote_emoji(positive: bool) -> String {
    if positive { "👍" } else { "👎" }.to_string()
}

/// Serialize a v2 `Follow` of a migrated identity.
pub fn finalize_follow(identity: &str) -> Vec<u8> {
    Content {
        content_body: Some(ContentBody::Follow(Follow {
            identity: identity.to_string(),
        })),
    }
    .encode_to_vec()
}

/// Serialize a v2 `AttributedToReaction` on a topic URL.
/// Phase 2: serialize an out-of-network reaction, attributing it to the
/// resolved (possibly unfurled) topic link.
pub fn finalize_attributed_reaction(link: &Link, positive: bool) -> Vec<u8> {
    Content {
        content_body: Some(ContentBody::AttributedToReaction(AttributedToReaction {
            attributed_to: Some(AttributedTo {
                to: Some(attributed_to::To::Link(link.clone())),
            }),
            emoji: Some(vote_emoji(positive)),
            positive,
        })),
    }
    .encode_to_vec()
}

/// Namespace for legacy references we couldn't turn into a real URL, so the
/// original id is preserved on the post and can be re-resolved later.
const LEGACY_REF_PREFIX: &str = "grayjay://polycentric-legacy-ref/";

/// Resolve a v1 event's Bytes references (each a UTF-8 topic string) into
/// attribution [`Topic`]s.
pub fn topics(references: &[LegacyReference]) -> Vec<Topic> {
    references
        .iter()
        .filter(|r| r.reference_type == REF_BYTES)
        .filter_map(|r| String::from_utf8(r.reference.clone()).ok())
        .map(|raw| classify_topic(&raw))
        .collect()
}

/// Classify one raw reference string into an attribution [`Topic`]:
/// - `http(s)://…` -> web URL (unfurled into a preview);
/// - a bare 11-char YouTube id -> canonical `watch?v=` URL (unfurled);
/// - another scheme URI (e.g. `lbry://…`) -> kept as-is, not unfurled;
/// - anything else (Rumble slug, hex, numeric, `video_episode:<uuid>`, …)
///   -> wrapped in the legacy-ref namespace so the id is still attributed.
fn classify_topic(raw: &str) -> Topic {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        Topic {
            url: raw.to_string(),
            previewable: true,
        }
    } else if crate::youtube::is_video_id(raw) {
        Topic {
            url: format!("https://www.youtube.com/watch?v={raw}"),
            previewable: true,
        }
    } else if raw.contains("://") {
        Topic {
            url: raw.to_string(),
            previewable: false,
        }
    } else {
        Topic {
            url: format!("{LEGACY_REF_PREFIX}{raw}"),
            previewable: false,
        }
    }
}

fn url_link(url: &str) -> AttributedTo {
    AttributedTo {
        to: Some(attributed_to::To::Link(Link {
            title: String::new(),
            description: String::new(),
            image: String::new(),
            url: url.to_string(),
        })),
    }
}

/// Keep the latest (by timestamp) UTF-8 value of a v1 CRDT profile field.
fn update_latest(slot: &mut Option<(u64, String)>, event: &LegacyEvent) {
    let Some(bytes) = event.lww_value.as_ref() else {
        return;
    };
    let Ok(value) = String::from_utf8(bytes.clone()) else {
        return;
    };
    let ts = event.unix_milliseconds;
    if slot.as_ref().is_none_or(|(cur, _)| ts >= *cur) {
        *slot = Some((ts, value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_topic_references() {
        // http(s) URLs pass through and are previewable.
        let t = classify_topic("https://www.youtube.com/watch?v=abc");
        assert_eq!(t.url, "https://www.youtube.com/watch?v=abc");
        assert!(t.previewable);

        // Bare 11-char YouTube ids are normalized to a watch URL.
        let t = classify_topic("papQ8xQxizA");
        assert_eq!(t.url, "https://www.youtube.com/watch?v=papQ8xQxizA");
        assert!(t.previewable);

        // Other scheme URIs are kept as-is but not unfurled.
        let t = classify_topic("lbry://they-all-look-the-same#7499f1");
        assert_eq!(t.url, "lbry://they-all-look-the-same#7499f1");
        assert!(!t.previewable);

        // Bare non-URL ids are wrapped in the legacy-ref namespace.
        for raw in [
            "v3pvi2v",                                    // rumble-style slug
            "c38967d5d7484eb4aba01dfa60d0dcc9ff9fae49",   // hex40
            "121111915",                                  // numeric
            "video_episode:e715a63d-7cc7-4830-bd00-1e3d", // grayjay episode
        ] {
            let t = classify_topic(raw);
            assert_eq!(t.url, format!("grayjay://polycentric-legacy-ref/{raw}"));
            assert!(!t.previewable);
        }
    }

    fn opinion(value: &[u8], target: OpinionTarget) -> LegacyOpinion {
        LegacyOpinion {
            value: value.to_vec(),
            unix_milliseconds: 1_000,
            target,
        }
    }

    #[test]
    fn opinion_on_a_url_becomes_a_url_reaction() {
        let mut url = HashMap::new();
        let mut post = HashMap::new();
        let op = opinion(
            OPINION_LIKE,
            OpinionTarget::Bytes(b"https://youtu.be/abc".to_vec()),
        );
        assert!(record_opinion(&mut url, &mut post, &op));
        assert_eq!(url.len(), 1);
        assert!(post.is_empty());
        assert!(url.contains_key("https://youtu.be/abc"));
    }

    #[test]
    fn bare_youtube_id_opinion_normalizes_and_collapses() {
        // The same video referenced as a bare id and as a full URL collapses to
        // a single reaction (latest wins).
        let mut url = HashMap::new();
        let mut post = HashMap::new();
        let mut older = opinion(OPINION_LIKE, OpinionTarget::Bytes(b"papQ8xQxizA".to_vec()));
        older.unix_milliseconds = 1;
        let mut newer = opinion(
            OPINION_DISLIKE,
            OpinionTarget::Bytes(b"https://www.youtube.com/watch?v=papQ8xQxizA".to_vec()),
        );
        newer.unix_milliseconds = 2;
        assert!(record_opinion(&mut url, &mut post, &older));
        assert!(record_opinion(&mut url, &mut post, &newer));
        assert_eq!(url.len(), 1, "both forms map to one target");
        let state = url
            .get("https://www.youtube.com/watch?v=papQ8xQxizA")
            .expect("normalized key");
        assert!(!state.positive, "the newer (dislike) wins");
    }

    #[test]
    fn opinion_on_a_post_becomes_an_in_network_reaction() {
        let mut url = HashMap::new();
        let mut post = HashMap::new();
        let key = ("1122".to_string(), "3344:5".to_string());
        let op = opinion(
            OPINION_DISLIKE,
            OpinionTarget::Pointer(TargetPointer {
                system_hex: key.0.clone(),
                pointer: key.1.clone(),
            }),
        );
        assert!(record_opinion(&mut url, &mut post, &op));
        assert!(url.is_empty());
        assert_eq!(post.len(), 1);
        let state = post.get(&key).expect("keyed by target pointer");
        assert!(!state.positive);

        // Resolve it in phase 2 against the global map.
        let ek = EventKey {
            collection: collections::FEED,
            identity: "targetid".to_string(),
            signed_by: None,
            sequence: 9,
        };
        let mut reply_map = HashMap::new();
        reply_map.insert(key.clone(), ek.clone());
        let bytes = finalize_reaction(
            &ReactionPlan {
                target: TargetPointer {
                    system_hex: key.0.clone(),
                    pointer: key.1.clone(),
                },
                positive: false,
            },
            &reply_map,
        )
        .expect("target resolves");
        let content = Content::decode(bytes.as_slice()).unwrap();
        match content.content_body {
            Some(ContentBody::Reaction(r)) => {
                assert_eq!(r.event_key, Some(ek));
                assert!(!r.positive);
            }
            other => panic!("expected Reaction, got {other:?}"),
        }

        // A target that wasn't migrated is dropped.
        assert!(
            finalize_reaction(
                &ReactionPlan {
                    target: TargetPointer {
                        system_hex: "dead".to_string(),
                        pointer: "beef:1".to_string(),
                    },
                    positive: true,
                },
                &reply_map,
            )
            .is_none()
        );
    }
}
