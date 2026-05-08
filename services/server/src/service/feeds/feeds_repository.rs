use ::entity::content_follow_model as ContentFollowModel;
use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use sea_orm::FromQueryResult;
use sea_orm::sea_query::{Expr, IntoCondition};
use sea_orm::*;

// Collection numbers shared with the client (see js-core/src/constants.ts).
const FEED_COLLECTION: i16 = 2;
const GRAPH_COLLECTION: i16 = 5;

pub struct Query;

pub type FeedRow = (EventModel::Model, Option<ContentModel::Model>);

impl Query {
    /// Return recent Feed events (with joined content) newest first.
    pub async fn list_feed_events(
        db: &DbConn,
        limit: u64,
    ) -> Result<Vec<FeedRow>, DbErr> {
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Collection.eq(FEED_COLLECTION))
            .order_by_desc(EventModel::Column::CreatedAt)
            .limit(limit)
            .all(db)
            .await
    }

    /// Return the list of identities that `caller` has followed (as
    /// recorded by Follow events in the GRAPH collection).
    ///
    /// Unfollow (Delete) tombstones are not yet applied server-side, so a
    /// previously-unfollowed identity still appears here.
    pub async fn list_followed_identities(
        db: &DbConn,
        caller: &str,
    ) -> Result<Vec<String>, DbErr> {
        // Deduplicate because the same Follow content (by digest) may be
        // referenced by multiple events — e.g. follow → unfollow → follow
        // again all share one content row but produce distinct events.
        let rows = EventModel::Entity::find()
            .select_only()
            .column(ContentFollowModel::Column::IdentityId)
            .distinct()
            .join(JoinType::InnerJoin, content_join())
            .join(
                JoinType::InnerJoin,
                ContentModel::Entity::belongs_to(ContentFollowModel::Entity)
                    .from(ContentModel::Column::Id)
                    .to(ContentFollowModel::Column::ContentId)
                    .into(),
            )
            .filter(EventModel::Column::Collection.eq(GRAPH_COLLECTION))
            .filter(EventModel::Column::Identity.eq(caller))
            .into_tuple::<String>()
            .all(db)
            .await?;

        Ok(rows)
    }

    /// Return recent Feed events (with joined content) authored by any of
    /// `identities`, newest first. Short-circuits with an empty Vec when
    /// the identity list is empty.
    pub async fn list_feed_events_by_identities(
        db: &DbConn,
        identities: Vec<String>,
        limit: u64,
    ) -> Result<Vec<FeedRow>, DbErr> {
        if identities.is_empty() {
            return Ok(Vec::new());
        }

        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Collection.eq(FEED_COLLECTION))
            .filter(EventModel::Column::Identity.is_in(identities))
            .order_by_desc(EventModel::Column::CreatedAt)
            .limit(limit)
            .all(db)
            .await
    }

    /// Look up a single event (with joined content) by its EventKey tuple.
    pub async fn find_event_by_key(
        db: &DbConn,
        collection: i16,
        identity: &str,
        public_key_type: i16,
        public_key: Vec<u8>,
        sequence: i16,
    ) -> Result<Option<FeedRow>, DbErr> {
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Collection.eq(collection))
            .filter(EventModel::Column::Identity.eq(identity))
            .filter(EventModel::Column::PublicKeyType.eq(public_key_type))
            .filter(EventModel::Column::PublicKey.eq(public_key))
            .filter(EventModel::Column::Sequence.eq(sequence))
            .one(db)
            .await
    }

    /// Bulk-fetch event rows by primary key, joining content. Order of the
    /// returned Vec is unspecified — caller reorders against the input list.
    pub async fn list_events_by_ids(
        db: &DbConn,
        ids: Vec<i64>,
    ) -> Result<Vec<FeedRow>, DbErr> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Id.is_in(ids))
            .all(db)
            .await
    }

    /// Return ids (and height) of ancestors
    pub async fn list_ancestor_refs(
        db: &DbConn,
        subject_event_id: i64,
        max_height: i32,
    ) -> Result<Vec<AncestorRef>, DbErr> {
        let stmt = Statement::from_sql_and_values(
            db.get_database_backend(),
            r#"
            WITH RECURSIVE ancestor(event_id, height) AS (
                SELECT pe.id, 1
                FROM events sub_e
                INNER JOIN content sub_c
                    ON sub_c.digest_type = sub_e.content_digest_type
                    AND sub_c.digest_bytes = sub_e.content_digest_bytes
                INNER JOIN content_post sub_cp
                    ON sub_cp.content_id = sub_c.id
                INNER JOIN events pe
                    ON pe.collection = sub_cp.reply_parent_collection
                    AND pe.identity = sub_cp.reply_parent_identity
                    AND pe.public_key_type = sub_cp.reply_parent_public_key_type
                    AND pe.public_key = sub_cp.reply_parent_public_key
                    AND pe.sequence = sub_cp.reply_parent_sequence
                WHERE sub_e.id = $1

                UNION ALL

                SELECT npe.id, a.height + 1
                FROM ancestor a
                INNER JOIN events ae ON ae.id = a.event_id
                INNER JOIN content ac
                    ON ac.digest_type = ae.content_digest_type
                    AND ac.digest_bytes = ae.content_digest_bytes
                INNER JOIN content_post acp
                    ON acp.content_id = ac.id
                INNER JOIN events npe
                    ON npe.collection = acp.reply_parent_collection
                    AND npe.identity = acp.reply_parent_identity
                    AND npe.public_key_type = acp.reply_parent_public_key_type
                    AND npe.public_key = acp.reply_parent_public_key
                    AND npe.sequence = acp.reply_parent_sequence
                WHERE a.height < $2
            )
            SELECT event_id, height FROM ancestor ORDER BY height DESC
            "#,
            vec![subject_event_id.into(), max_height.into()],
        );
        AncestorRef::find_by_statement(stmt).all(db).await
    }

    /// Return every descendant of the subject as `(event_id, parent_event_id,
    /// depth)`, ordered (depth ASC, created_at DESC) so per-parent groupings
    /// come newest-first. Caller applies branching/sort/flatten.
    pub async fn list_descendant_refs(
        db: &DbConn,
        subject_event_id: i64,
        max_depth: i32,
        limit: u64,
    ) -> Result<Vec<DescendantRef>, DbErr> {
        let stmt = Statement::from_sql_and_values(
            db.get_database_backend(),
            r#"
            WITH RECURSIVE descendant(event_id, parent_event_id, depth, sort_at) AS (
                SELECT reply_e.id, sub_e.id, 1, reply_e.created_at
                FROM events sub_e
                INNER JOIN content_post cp
                    ON cp.reply_parent_collection = sub_e.collection
                    AND cp.reply_parent_identity = sub_e.identity
                    AND cp.reply_parent_public_key_type = sub_e.public_key_type
                    AND cp.reply_parent_public_key = sub_e.public_key
                    AND cp.reply_parent_sequence = sub_e.sequence
                INNER JOIN content c ON c.id = cp.content_id
                INNER JOIN events reply_e
                    ON reply_e.content_digest_type = c.digest_type
                    AND reply_e.content_digest_bytes = c.digest_bytes
                WHERE sub_e.id = $1

                UNION ALL

                SELECT reply_e.id, de.id, d.depth + 1, reply_e.created_at
                FROM descendant d
                INNER JOIN events de ON de.id = d.event_id
                INNER JOIN content_post cp
                    ON cp.reply_parent_collection = de.collection
                    AND cp.reply_parent_identity = de.identity
                    AND cp.reply_parent_public_key_type = de.public_key_type
                    AND cp.reply_parent_public_key = de.public_key
                    AND cp.reply_parent_sequence = de.sequence
                INNER JOIN content c ON c.id = cp.content_id
                INNER JOIN events reply_e
                    ON reply_e.content_digest_type = c.digest_type
                    AND reply_e.content_digest_bytes = c.digest_bytes
                WHERE d.depth < $2
            )
            SELECT event_id, parent_event_id, depth FROM descendant
            ORDER BY depth ASC, sort_at DESC
            LIMIT $3
            "#,
            vec![
                subject_event_id.into(),
                max_depth.into(),
                (limit as i64).into(),
            ],
        );
        DescendantRef::find_by_statement(stmt).all(db).await
    }
}

/// Relation joining an event to its content row on (digest_type, digest_bytes).
fn content_join() -> RelationDef {
    EventModel::Entity::belongs_to(ContentModel::Entity)
        .from(EventModel::Column::ContentDigestType)
        .to(ContentModel::Column::DigestType)
        .on_condition(|event_tbl, content_tbl| {
            Expr::col((event_tbl, EventModel::Column::ContentDigestBytes))
                .equals((content_tbl, ContentModel::Column::DigestBytes))
                .into_condition()
        })
        .into()
}

#[derive(Debug, FromQueryResult)]
pub struct AncestorRef {
    pub event_id: i64,
}

#[derive(Debug, FromQueryResult)]
pub struct DescendantRef {
    pub event_id: i64,
    pub parent_event_id: i64,
}
