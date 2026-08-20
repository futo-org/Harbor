use ::entity::content_follow_model as ContentFollowModel;
use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use polycentric_common::models::collections;
use prost::Message;
use sea_orm::*;
use std::collections::HashSet;
use tonic::Status;

use crate::data::{Cursor, CursorFilter};
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{self, EventWithContentRow};
use crate::service::feeds::repository::{EventCreatedAt, content_join};
use crate::service::proto::Content;
use crate::service::proto::content::ContentBody;

const GRAPH_COLLECTION: i16 = collections::SOCIAL_GRAPH as i16;

pub struct Query;

impl Query {
    /// Return the list of identities that `caller` has followed,
    /// excluding any Follow event tombstoned by a *valid* Delete
    /// event.
    ///
    /// Follow → Unfollow → Follow-again resolves to "following"
    /// because the re-follow event has a fresh sequence and no
    /// valid Delete points at it.
    ///
    /// TODO: We can either cache these OR keep a follower table that we update on ingest.
    /// This current query is inefficient.
    pub async fn list_followed_identities(
        ctx: &ServiceContext,
        caller: &str,
    ) -> Result<Vec<String>, Status> {
        let rows: Vec<EventWithContentRow> = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            .filter(EventModel::Column::Collection.eq(GRAPH_COLLECTION))
            .filter(EventModel::Column::Identity.eq(caller))
            .all(&ctx.db)
            .await
            .map_err(map_db_err)?;

        let keys: Vec<TargetEventKey> = rows
            .iter()
            .map(|(event, _)| TargetEventKey::of(event))
            .collect();
        let raw_tombstones =
            tombstone::list_tombstones_for_event_keys(&ctx.db, &keys)
                .await
                .map_err(map_db_err)?;
        let valid_tombstones =
            tombstone::validate_tombstones(ctx, raw_tombstones).await?;

        let mut seen: HashSet<String> = HashSet::new();
        let mut result: Vec<String> = Vec::new();
        for (event, content) in rows {
            let key = TargetEventKey::of(&event);
            if valid_tombstones.contains_key(&key) {
                continue;
            }
            let Some(content) = content else { continue };
            if let Some(identity) = decode_followed_identity(&content)
                && seen.insert(identity.clone())
            {
                result.push(identity);
            }
        }
        Ok(result)
    }

    /// Count of distinct identities `identity` follows (tombstone-aware).
    ///
    /// TODO: same inefficiency as `list_followed_identities` — a
    /// maintained counter would avoid scanning the graph rows.
    pub async fn count_following(
        ctx: &ServiceContext,
        identity: &str,
    ) -> Result<u64, Status> {
        Ok(Self::list_followed_identities(ctx, identity).await?.len() as u64)
    }

    /// Count of distinct identities following `identity`
    /// (tombstone-aware).
    pub async fn count_followers(
        ctx: &ServiceContext,
        identity: &str,
    ) -> Result<u64, Status> {
        let rows: Vec<EventWithContentRow> = follow_events_query()
            .filter(ContentFollowModel::Column::IdentityId.eq(identity))
            .all(&ctx.db)
            .await
            .map_err(map_db_err)?;

        let keys: Vec<TargetEventKey> = rows
            .iter()
            .map(|(event, _)| TargetEventKey::of(event))
            .collect();
        let raw_tombstones =
            tombstone::list_tombstones_for_event_keys(&ctx.db, &keys)
                .await
                .map_err(map_db_err)?;
        let valid_tombstones =
            tombstone::validate_tombstones(ctx, raw_tombstones).await?;

        let followers: HashSet<&str> = rows
            .iter()
            .filter(|(event, _)| {
                !valid_tombstones.contains_key(&TargetEventKey::of(event))
            })
            .map(|(event, _)| event.identity.as_str())
            .collect();
        Ok(followers.len() as u64)
    }

    /// Follow events authored by `identity` — who they follow. Newest
    /// first, keyset-paginated, tombstones NOT yet filtered.
    pub async fn list_following_events(
        db: &DbConn,
        identity: &str,
        limit: u32,
        cursor_filter: Option<&CursorFilter<EventCreatedAt>>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        let query = follow_events_query()
            .filter(EventModel::Column::Identity.eq(identity));
        page_follow_events(db, query, limit, cursor_filter).await
    }

    /// Follow events targeting `identity` — who follows them. Newest
    /// first, keyset-paginated, tombstones NOT yet filtered.
    pub async fn list_followers_events(
        db: &DbConn,
        identity: &str,
        limit: u32,
        cursor_filter: Option<&CursorFilter<EventCreatedAt>>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        let query = follow_events_query()
            .filter(ContentFollowModel::Column::IdentityId.eq(identity));
        page_follow_events(db, query, limit, cursor_filter).await
    }
}

/// Graph events joined to their Follow content. The inner joins keep
/// Delete (unfollow) events out of the page.
fn follow_events_query() -> SelectTwo<EventModel::Entity, ContentModel::Entity>
{
    EventModel::Entity::find()
        .select_also(ContentModel::Entity)
        .join(JoinType::InnerJoin, content_join())
        .join(JoinType::InnerJoin, follow_join())
        .filter(EventModel::Column::Collection.eq(GRAPH_COLLECTION))
}

/// Relation joining a content row to its Follow row.
fn follow_join() -> RelationDef {
    ContentModel::Entity::belongs_to(ContentFollowModel::Entity)
        .from(ContentModel::Column::Id)
        .to(ContentFollowModel::Column::ContentId)
        .into()
}

/// Apply the (created_at, id) keyset cursor and fetch, newest first.
/// Mirrors the feeds repository's pagination.
async fn page_follow_events(
    db: &DbConn,
    query: SelectTwo<EventModel::Entity, ContentModel::Entity>,
    limit: u32,
    cursor_filter: Option<&CursorFilter<EventCreatedAt>>,
) -> Result<Vec<EventWithContentRow>, DbErr> {
    let cursor_filter =
        cursor_filter.unwrap_or(&CursorFilter::Forward(Cursor::Start));

    let mut sea_cursor = query
        .cursor_by((EventModel::Column::CreatedAt, EventModel::Column::Id));
    sea_cursor.desc();

    match cursor_filter {
        CursorFilter::Forward(cur) => {
            match cur {
                Cursor::Start => {}
                Cursor::Mid(marker) => {
                    sea_cursor.after(marker.values());
                }
                Cursor::End => return Ok(vec![]),
            }
            sea_cursor.first(limit.into());
        }
        CursorFilter::Backward(cur) => {
            match cur {
                Cursor::Start => return Ok(vec![]),
                Cursor::Mid(marker) => {
                    sea_cursor.before(marker.values());
                }
                Cursor::End => {}
            }
            sea_cursor.last(limit.into());
        }
    }

    sea_cursor.all(db).await
}

/// Identity of the target of a Follow event, decoded from the
/// parent content row.
fn decode_followed_identity(
    content: &::entity::content_model::Model,
) -> Option<String> {
    let decoded = Content::decode(content.serialized_bytes.as_slice()).ok()?;
    match decoded.content_body? {
        ContentBody::Follow(follow) => {
            Some(follow.identity).filter(|s| !s.is_empty())
        }
        _ => None,
    }
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    tracing::error!(error = %e, "graph repository db error");
    Status::internal("internal server error")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::Follow;
    use chrono::Utc;
    use sea_orm::prelude::DateTimeWithTimeZone;
    use sea_orm::{DatabaseConnection, DbBackend, MockDatabase, MockRow};
    use std::sync::Arc;

    async fn ctx(db: DatabaseConnection) -> Arc<ServiceContext> {
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        ServiceContext::new(db, kafka_producer)
    }

    fn now() -> DateTimeWithTimeZone {
        Utc::now().fixed_offset()
    }

    fn event_row(id: i64, identity: &str, sequence: i64) -> EventModel::Model {
        EventModel::Model {
            id,
            collection: GRAPH_COLLECTION,
            identity: identity.to_string(),
            public_key_type: 1,
            public_key: vec![0xaa],
            sequence,
            content_digest_type: Some(1),
            content_digest_bytes: Some(vec![id as u8]),
            signature: vec![],
            previous_signature: vec![],
            previous_root: vec![],
            event_bytes: vec![id as u8],
            created_at: now(),
            synced_at: now(),
        }
    }

    fn follow_row(id: i64, target: &str) -> ContentModel::Model {
        let content = Content {
            content_body: Some(ContentBody::Follow(Follow {
                identity: target.to_string(),
            })),
        };
        ContentModel::Model {
            id,
            digest_type: 1,
            digest_bytes: vec![id as u8],
            serialized_bytes: content.encode_to_vec(),
            synced_at: now(),
        }
    }

    fn no_tombstones() -> Vec<MockRow> {
        Vec::new()
    }

    #[tokio::test]
    async fn count_followers_dedupes_follower_identities() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![
                (event_row(1, "alice", 1), follow_row(1, "target")),
                (event_row(2, "alice", 2), follow_row(2, "target")),
                (event_row(3, "bob", 1), follow_row(3, "target")),
            ]])
            .append_query_results([no_tombstones()])
            .into_connection();
        let ctx = ctx(db).await;

        let count = Query::count_followers(&ctx, "target").await.unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn count_following_dedupes_followed_identities() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![
                (event_row(1, "alice", 1), follow_row(1, "bob")),
                (event_row(2, "alice", 2), follow_row(2, "bob")),
                (event_row(3, "alice", 3), follow_row(3, "carol")),
            ]])
            .append_query_results([no_tombstones()])
            .into_connection();
        let ctx = ctx(db).await;

        let count = Query::count_following(&ctx, "alice").await.unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn list_followers_events_returns_rows_newest_first() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![
                (event_row(2, "bob", 1), follow_row(2, "target")),
                (event_row(1, "alice", 1), follow_row(1, "target")),
            ]])
            .into_connection();

        let rows = Query::list_followers_events(&db, "target", 10, None)
            .await
            .unwrap();
        let identities: Vec<&str> =
            rows.iter().map(|(e, _)| e.identity.as_str()).collect();
        assert_eq!(identities, ["bob", "alice"]);
    }

    #[tokio::test]
    async fn forward_end_cursor_short_circuits_without_querying() {
        // No mocked results: a database hit would error the query.
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();

        let rows = Query::list_following_events(
            &db,
            "alice",
            10,
            Some(&CursorFilter::Forward(Cursor::End)),
        )
        .await
        .unwrap();
        assert!(rows.is_empty());
    }

    #[tokio::test]
    async fn backward_start_cursor_short_circuits_without_querying() {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();

        let rows = Query::list_followers_events(
            &db,
            "alice",
            10,
            Some(&CursorFilter::Backward(Cursor::Start)),
        )
        .await
        .unwrap();
        assert!(rows.is_empty());
    }
}
