use ::entity::{content_model as ContentModel, event_model as EventModel};
use sea_orm::*;

use super::{
    EventWithContent, RECENT_LIMIT, decode_content_proto, latest_profile_update,
};

/// Base query: events left-joined to their content row (matched on the
/// optional content digest). Mirrors the join used by the events repo.
fn query_events_with_content()
-> sea_orm::SelectTwo<EventModel::Entity, ContentModel::Entity> {
    use sea_orm::sea_query::{Expr, IntoCondition};
    EventModel::Entity::find()
        .select_also(ContentModel::Entity)
        .join(
            JoinType::LeftJoin,
            EventModel::Entity::belongs_to(ContentModel::Entity)
                .from(EventModel::Column::ContentDigestType)
                .to(ContentModel::Column::DigestType)
                .on_condition(|event_tbl, content_tbl| {
                    Expr::col((
                        event_tbl,
                        EventModel::Column::ContentDigestBytes,
                    ))
                    .equals((content_tbl, ContentModel::Column::DigestBytes))
                    .into_condition()
                })
                .into(),
        )
}

/// Convenience: fetch the latest `ProfileUpdate` for an identity. Used to
/// attach pfp/display-name to bylines on event detail pages.
pub(super) async fn latest_profile_for_identity(
    db: &DatabaseConnection,
    identity: &str,
) -> Option<crate::service::proto::ProfileUpdate> {
    let events = query_events_for_identity(db, identity).await;
    let refs: Vec<&EventWithContent> = events.iter().collect();
    latest_profile_update(&refs)
}

/// Up to `RECENT_LIMIT` recent events, optionally restricted to one
/// collection. Returned in whatever order the events repo gives back.
/// Callers re-sort if they want a different order.
pub(super) async fn query_recent_events(
    db: &DatabaseConnection,
    collection: Option<i32>,
) -> Vec<EventWithContent> {
    crate::service::events::events_repository::Query::list_events(
        db,
        Some(RECENT_LIMIT),
        collection,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap_or_default()
}

/// All events for a single identity, with content joined.
pub(super) async fn query_events_for_identity(
    db: &DatabaseConnection,
    identity: &str,
) -> Vec<EventWithContent> {
    query_events_with_content()
        .filter(EventModel::Column::Identity.eq(identity.to_owned()))
        .order_by_desc(EventModel::Column::Sequence)
        .limit(RECENT_LIMIT)
        .all(db)
        .await
        .unwrap_or_default()
}

/// All events for any of `identities`, with content joined. Empty input
/// short-circuits. `is_in([])` would otherwise produce a SQL `IN ()`.
pub(super) async fn query_events_for_identities(
    db: &DatabaseConnection,
    identities: &std::collections::BTreeSet<String>,
) -> Vec<EventWithContent> {
    if identities.is_empty() {
        return Vec::new();
    }
    query_events_with_content()
        .filter(EventModel::Column::Identity.is_in(identities.iter().cloned()))
        .order_by_desc(EventModel::Column::Sequence)
        .limit(RECENT_LIMIT)
        .all(db)
        .await
        .unwrap_or_default()
}

/// Look up a single event by its `(identity, collection, sequence)` triple,
/// joining its content row if present. Avoids the "not in last N events"
/// silent miss that filtering `query_events` would suffer from.
pub(super) async fn query_event(
    db: &DatabaseConnection,
    identity: &str,
    collection: i16,
    sequence: i64,
) -> Option<EventWithContent> {
    query_events_with_content()
        .filter(EventModel::Column::Identity.eq(identity.to_owned()))
        .filter(EventModel::Column::Collection.eq(collection))
        .filter(EventModel::Column::Sequence.eq(sequence))
        .one(db)
        .await
        .ok()
        .flatten()
}

/// Walk recent feed events looking for posts whose `reply.parent` points
/// at `(parent_identity, parent_collection, parent_sequence)`. Returns
/// the matched events paired with their decoded `Post`, sorted newest-
/// first by `created_at`. Bounded by whatever the caller fetched.
pub(super) fn replies_to(
    feed_events: &[EventWithContent],
    parent_identity: &str,
    parent_collection: i32,
    parent_sequence: u64,
) -> Vec<(EventModel::Model, crate::service::proto::Post)> {
    use crate::service::proto::content::ContentBody;
    let mut replies: Vec<(EventModel::Model, crate::service::proto::Post)> =
        Vec::new();
    for (ev, content) in feed_events {
        let Some(content) = content else { continue };
        let Some(proto) = decode_content_proto(&content.serialized_bytes)
        else {
            continue;
        };
        let Some(ContentBody::Post(post)) = proto.content_body else {
            continue;
        };
        let Some(reply) = post.reply.as_ref() else {
            continue;
        };
        let Some(parent) = reply.parent.as_ref() else {
            continue;
        };
        if parent.identity == parent_identity
            && parent.collection == parent_collection
            && parent.sequence == parent_sequence
        {
            replies.push((ev.clone(), post));
        }
    }
    replies.sort_by_key(|r| std::cmp::Reverse(r.0.created_at));
    replies
}
