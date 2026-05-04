use ::entity::event_model as EventModel;
use axum::{
    Json,
    extract::{Path, Query, State},
};
use maud::{Markup, html};
use sea_orm::*;
use serde_json::{Value, json};
use std::sync::Arc;

use super::{
    Collection, DebugState, EventWithContent, RECENT_LIMIT,
    decode_content_proto, decode_event_proto, display_label, format_pubkey,
    latest_profile_update,
    query::{
        latest_profile_for_identity, query_event, query_events_for_identities,
        query_events_for_identity, query_recent_events, replies_to,
    },
    shorten_hex, vector_clock_string,
    view::{
        back_to_debug_view, collections_view, content_view, display_name_line,
        event_card_view, expanded_feed_card_or_fallback, filter_bar_view,
        key_link_view, page_view, post_card_view, profile_row_view,
        reply_chip_view,
    },
};

pub(super) async fn debug_page_handler(
    State(state): State<Arc<DebugState>>,
    Query(filters): Query<std::collections::HashMap<String, String>>,
) -> Markup {
    use crate::service::proto::content::ContentBody;

    let submitted = filters.contains_key("submitted");
    let name_filter = filters
        .get("name")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let identity_filter = filters
        .get("identity")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let key_bytes: Option<Vec<u8>> = filters
        .get("key")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|s| hex::decode(s).ok());
    let collection_visible = |c: i16| -> bool {
        if !submitted {
            return true;
        }
        let key = match c {
            1 => "identity",
            2 => "feed",
            3 => "profile",
            4 => "interactions",
            5 => "social_graph",
            _ => return false,
        };
        filters.contains_key(&format!("show_{}", key))
    };

    let expand = filters.contains_key("expand");

    let mut events = query_recent_events(&state.db, None).await;
    events.sort_by_key(|e| std::cmp::Reverse(e.0.synced_at));

    // Build identity -> latest ProfileUpdate map from any profile events
    // present in the recent window. Used for both the name filter and
    // the expanded feed-card pfp/byline rendering. Limitation: an
    // identity whose profile event sits outside the recent 200 won't
    // be resolvable here and falls back to its short hex.
    let mut profile_by_identity: std::collections::HashMap<
        String,
        (i64, crate::service::proto::ProfileUpdate),
    > = std::collections::HashMap::new();
    for (ev, content) in &events {
        if ev.collection != 3 {
            continue;
        }
        let Some(content) = content else { continue };
        let Some(proto) = decode_content_proto(&content.serialized_bytes)
        else {
            continue;
        };
        if let Some(ContentBody::ProfileUpdate(pu)) = proto.content_body {
            let entry =
                profile_by_identity.entry(ev.identity.clone()).or_insert((
                    -1,
                    crate::service::proto::ProfileUpdate::default(),
                ));
            if ev.sequence > entry.0 {
                *entry = (ev.sequence, pu);
            }
        }
    }

    let name_match: Option<std::collections::HashSet<String>> = name_filter
        .map(|target| {
            profile_by_identity
                .iter()
                .filter(|(_, (_, p))| p.name.as_deref() == Some(target))
                .map(|(id, _)| id.clone())
                .collect()
        });

    let filtered: Vec<&EventWithContent> = events
        .iter()
        .filter(|(ev, _)| {
            if !collection_visible(ev.collection) {
                return false;
            }
            if let Some(target) = identity_filter
                && ev.identity != target
            {
                return false;
            }
            if let Some(ref bytes) = key_bytes
                && ev.public_key != *bytes
            {
                return false;
            }
            if let Some(ref ids) = name_match
                && !ids.contains(&ev.identity)
            {
                return false;
            }
            true
        })
        .collect();

    page_view(
        "Debug - Events",
        html! {
            (filter_bar_view(&filters))
            h1 { "Events" }
            p { "Total: " (filtered.len()) }
            @for event in &filtered {
                @if expand && event.0.collection == 2 {
                    (expanded_feed_card_or_fallback(event, &profile_by_identity))
                } @else {
                    (event_card_view(event, false, false))
                }
            }
        },
    )
}

pub(super) async fn identity_detail_handler(
    State(state): State<Arc<DebugState>>,
    Path(identity_hex): Path<String>,
) -> Markup {
    let events = query_events_for_identity(&state.db, &identity_hex).await;

    let mut collections_map: std::collections::BTreeMap<i16, Vec<_>> =
        std::collections::BTreeMap::new();
    for event in &events {
        collections_map
            .entry(event.0.collection)
            .or_default()
            .push(event);
    }
    for events in collections_map.values_mut() {
        events.sort_by_key(|e| e.0.sequence);
    }

    let authorized_keys =
        crate::service::identity::identity_repository::Query::authorized_keys(
            &state.db,
            &identity_hex,
        )
        .await
        .unwrap_or_default();

    let rotation_keys: Vec<_> = authorized_keys
        .iter()
        .filter(|k| k.is_rotation_key)
        .collect();
    let signing_keys: Vec<_> = authorized_keys
        .iter()
        .filter(|k| !k.is_rotation_key)
        .collect();

    let profile_events =
        collections_map.get(&3).map(|v| v.as_slice()).unwrap_or(&[]);
    let profile = latest_profile_update(profile_events);

    page_view(
        "Debug - Identity",
        html! {
            (profile_row_view(profile.as_ref(), html! {
                h1 style="margin: 0 0 8px 0;" { "Identity" }
                p style="word-break:break-all; margin: 0;" { code { (identity_hex) } }
                (display_name_line(profile.as_ref()))
            }))

            h2 { "Rotation Keys (" (rotation_keys.len()) ")" }
            ol { @for k in &rotation_keys { (key_link_view(&k.key)) } }

            h2 { "Signing Keys (" (signing_keys.len()) ")" }
            ol { @for k in &signing_keys { (key_link_view(&k.key)) } }

            (collections_view(&collections_map, None, true))
            (back_to_debug_view())
        },
    )
}

pub(super) async fn keypair_detail_handler(
    State(state): State<Arc<DebugState>>,
    Path(keypair_hex): Path<String>,
) -> Markup {
    let Ok(keypair_bytes) = hex::decode(&keypair_hex) else {
        return page_view(
            "Debug - Keypair",
            html! {
                h1 { "Invalid keypair hex" }
                (back_to_debug_view())
            },
        );
    };

    // Step 1: which identities has this key signed for, and what's its type?
    let signed = EventModel::Entity::find()
        .filter(EventModel::Column::PublicKey.eq(keypair_bytes.clone()))
        .limit(RECENT_LIMIT)
        .all(&state.db)
        .await
        .unwrap_or_default();
    let key_type = signed.first().map(|e| e.public_key_type);
    let identity_set: std::collections::BTreeSet<String> =
        signed.into_iter().map(|e| e.identity).collect();

    // Step 2: pull all events for those identities (so we can dim non-matching signers).
    let events = query_events_for_identities(&state.db, &identity_set).await;

    let mut identities: std::collections::BTreeMap<
        String,
        std::collections::BTreeMap<i16, Vec<_>>,
    > = std::collections::BTreeMap::new();
    for event in &events {
        identities
            .entry(event.0.identity.clone())
            .or_default()
            .entry(event.0.collection)
            .or_default()
            .push(event);
    }
    for collections in identities.values_mut() {
        for events in collections.values_mut() {
            events.sort_by_key(|e| e.0.sequence);
        }
    }

    let display = match key_type {
        Some(kt) => format_pubkey(kt, &keypair_bytes),
        None => keypair_hex.clone(),
    };

    page_view(
        "Debug - Keypair",
        html! {
            h1 { "Keypair" }
            p style="word-break:break-all" { code { (display) } }
            @for (identity, collections) in &identities {
                @let profile_events = collections.get(&3).map(|v| v.as_slice()).unwrap_or(&[]);
                @let profile = latest_profile_update(profile_events);
                (profile_row_view(profile.as_ref(), html! {
                    h2 style="margin: 0 0 8px 0;" { "Identity" }
                    p style="word-break:break-all; margin: 0;" {
                        a href={ "/identity/" (identity) } { (identity) }
                    }
                    (display_name_line(profile.as_ref()))
                }))
                (collections_view(collections, Some(&keypair_bytes), true))
            }
            (back_to_debug_view())
        },
    )
}

pub(super) async fn event_detail_handler(
    State(state): State<Arc<DebugState>>,
    Path((identity_hex, collection, sequence)): Path<(String, i16, i64)>,
) -> Markup {
    let Some((event, content)) =
        query_event(&state.db, &identity_hex, collection, sequence).await
    else {
        return page_view(
            "Event not found",
            html! {
                h1 { "Event not found" }
                (back_to_debug_view())
            },
        );
    };

    let signer_key_hex = hex::encode(&event.public_key);
    let signer_key_display =
        format_pubkey(event.public_key_type, &event.public_key);
    let sig_hex = hex::encode(&event.signature);
    let prev_sig_hex = hex::encode(&event.previous_signature);
    let prev_sig_display = if prev_sig_hex.is_empty() {
        "none".to_string()
    } else {
        prev_sig_hex
    };

    let proto = decode_event_proto(&event.event_bytes);
    let vc = vector_clock_string(proto.as_ref());
    let identity_seq = proto
        .as_ref()
        .map(|e| e.identity_sequence.to_string())
        .unwrap_or_else(|| "n/a".to_string());

    let content_proto = content
        .as_ref()
        .and_then(|c| decode_content_proto(&c.serialized_bytes));

    // If this is a Post that's a reply, capture the parent EventKey so
    // we can resolve the parent author's display name for the chip.
    let reply_parent: Option<crate::service::proto::EventKey> = content_proto
        .as_ref()
        .and_then(|p| p.content_body.as_ref())
        .and_then(|body| {
            use crate::service::proto::content::ContentBody;
            match body {
                ContentBody::Post(post) => {
                    post.reply.as_ref().and_then(|r| r.parent.clone())
                }
                _ => None,
            }
        });

    let content_markup = match content_proto {
        Some(p) => content_view(p),
        None => match content {
            Some(_) => html! { p { em { "Could not decode content" } } },
            None => html! { p { em { "No content stored" } } },
        },
    };

    // Resolve the post author's profile (for the page header byline).
    let main_profile =
        latest_profile_for_identity(&state.db, &event.identity).await;

    // Resolve the reply parent's profile (for the "Reply to <name>" chip).
    let parent_profile = match reply_parent.as_ref() {
        Some(parent) => {
            latest_profile_for_identity(&state.db, &parent.identity).await
        }
        None => None,
    };

    // Replies. Only meaningful for feed posts (collection 2).
    let replies = if event.collection == 2 {
        let feed = query_recent_events(&state.db, Some(2)).await;
        replies_to(
            &feed,
            &event.identity,
            event.collection as i32,
            event.sequence as u64,
        )
    } else {
        Vec::new()
    };

    page_view(
        "Event",
        html! {
            (profile_row_view(main_profile.as_ref(), html! {
                h1 style="margin: 0 0 8px 0;" { (Collection::from(event.collection)) "." (event.sequence) }
                p style="margin: 0;" {
                    a href={ "/identity/" (identity_hex) } {
                        (display_label(&identity_hex, main_profile.as_ref()))
                    }
                }
            }))
            p { strong { "Identity: " } a href={ "/identity/" (identity_hex) } { (identity_hex) } }
            p { strong { "Signer: " } a href={ "/keypair/" (signer_key_hex) } { (signer_key_display) } }
            p { strong { "Sequence: " } (event.sequence) }
            p { strong { "Identity Sequence: " } (identity_seq) }
            p { strong { "Vector Clock: " } code { (vc) } }
            p { strong { "Signature: " } code style="word-break:break-all" { (sig_hex) } }
            p { strong { "Previous Signature: " } code style="word-break:break-all" { (prev_sig_display) } }
            p { strong { "Created: " } (event.created_at) }
            @if let Some(parent) = reply_parent.as_ref() {
                (reply_chip_view(parent, parent_profile.as_ref()))
            }
            (content_markup)
            @if !replies.is_empty() {
                h2 { "Replies (" (replies.len()) ")" }
                @for (reply_ev, reply_post) in &replies {
                    @let reply_byline = html! {
                        div class="event-meta" style="margin-bottom: 8px;" {
                            a href={ "/identity/" (reply_ev.identity) } onclick="event.stopPropagation()" {
                                (shorten_hex(&reply_ev.identity))
                            }
                            " - " (reply_ev.created_at)
                        }
                    };
                    (post_card_view(reply_ev, reply_post, reply_byline, None))
                }
            }
            p {
                a href="/" { "[back to debug]" }
                " "
                a href={ "/event/" (identity_hex) "/" (event.collection) "/" (event.sequence) "/json" } { "[raw json]" }
            }
        },
    )
}

pub(super) async fn event_detail_json_handler(
    State(state): State<Arc<DebugState>>,
    Path((identity_hex, collection, sequence)): Path<(String, i16, i64)>,
) -> Json<Value> {
    let Some((event, _)) =
        query_event(&state.db, &identity_hex, collection, sequence).await
    else {
        return Json(json!({"error": "event not found"}));
    };

    let proto = decode_event_proto(&event.event_bytes);
    let vc: Vec<u64> = proto
        .as_ref()
        .and_then(|e| e.vector_clock.as_ref())
        .map(|vc| vc.sequence.clone())
        .unwrap_or_default();
    let identity_seq = proto.as_ref().map(|e| e.identity_sequence).unwrap_or(0);

    Json(json!({
        "collection": event.collection,
        "identity": identity_hex,
        "sequence": event.sequence,
        "identity_sequence": identity_seq,
        "vector_clock": vc,
        "signature": hex::encode(&event.signature),
        "previous_signature": hex::encode(&event.previous_signature),
        "signer_key": format_pubkey(event.public_key_type, &event.public_key),
        "created_at": event.created_at,
        "synced_at": event.synced_at,
    }))
}

pub(super) async fn event_content_handler(
    State(state): State<Arc<DebugState>>,
    Path((identity_hex, collection, sequence)): Path<(String, i16, i64)>,
) -> Json<Value> {
    let Some((event, content)) =
        query_event(&state.db, &identity_hex, collection, sequence).await
    else {
        return Json(json!({"error": "event not found"}));
    };

    match content {
        Some(content) => Json(json!({
            "event": {
                "identity": identity_hex,
                "collection": event.collection,
                "sequence": event.sequence,
            },
            "content": {
                "digest_type": content.digest_type,
                "digest_bytes": hex::encode(&content.digest_bytes),
                "serialized_bytes": hex::encode(&content.serialized_bytes),
            }
        })),
        None => Json(json!({"error": "event has no content"})),
    }
}

pub(super) async fn list_events_handler(
    State(state): State<Arc<DebugState>>,
) -> Json<Value> {
    let events = query_recent_events(&state.db, None).await;

    let event_list: Vec<Value> = events
        .iter()
        .map(|(event, _content)| {
            json!({
                "collection": event.collection,
                "identity": event.identity,
                "sequence": event.sequence,
                "signer_key": format_pubkey(event.public_key_type, &event.public_key),
                "created_at": event.created_at,
                "synced_at": event.synced_at,
            })
        })
        .collect();

    Json(json!({
        "count": event_list.len(),
        "events": event_list,
    }))
}
