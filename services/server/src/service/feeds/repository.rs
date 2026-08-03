pub use crate::service::events::tombstone::EventWithContentRow;
use crate::service::{events::TargetEventKey, feeds::util::PageCursor};
use ::entity::{
    content_label_model as ContentLabelModel, content_model as ContentModel,
    content_reaction_model as ContentReactionModel, event_model as EventModel,
};
use polycentric_common::models::collections;
use sea_orm::{
    Condition, FromQueryResult,
    entity::prelude::*,
    sea_query::{
        Expr, IntoCondition, IntoValueTuple, PostgresQueryBuilder,
        Query as SeaQuery,
    },
    *,
};
use serde::{Deserialize, Serialize};

const FEED_COLLECTION: i16 = collections::FEED as i16;
const PROFILE_COLLECTION: i16 = collections::PROFILE as i16;

/// Cursor type for paginated feed queries.
#[derive(Clone, Serialize, Deserialize)]
pub enum FeedCursor {
    /// Marks the start of the feed.
    /// Forward queries return the first items and backward queries return nothing.
    Start,
    /// Marks somewhere in the feed.
    /// Forward queries return items following this point and
    /// backward queries return items preceding this point.
    Mid(FeedMarker),
    /// Marks the end of the feed.
    /// Forward queries return nothing and backward queries return the last items.
    End,
}

/// Exclusive lowerbound/upperbound for a feed query
#[derive(Clone, Serialize, Deserialize)]
pub struct FeedMarker {
    pub created_at: TimeDateTimeWithTimeZone,
    pub id: i64,
}

impl PageCursor for FeedCursor {}

impl FeedMarker {
    /// Get the database columns to compare against a cursor as a rust tuple.
    fn cols() -> impl IdentityOf<EventModel::Entity> {
        (EventModel::Column::CreatedAt, EventModel::Column::Id)
    }

    /// Get a rust tuple of this cursor's fields.
    fn values(&self) -> impl IntoValueTuple {
        (self.created_at, self.id)
    }
}

/// Retrieve items in the feed relative to a cursor.
pub enum CursorFilter {
    Forward(FeedCursor),
    Backward(FeedCursor),
}

pub struct Query;

impl Query {
    /// Recent Feed events (with joined content) newest first,
    /// including those that have been tombstoned.
    pub async fn list_feed_events(
        db: &DbConn,
        limit: u64,
        cursor_filter: &Option<CursorFilter>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        Self::do_list_feed_events(db, limit, None, cursor_filter).await
    }

    /// Same as [`list_feed_events`] restricted to events authored by
    /// any of `identities`. Short-circuits with an empty Vec when
    /// the identity list is empty.
    pub async fn list_feed_events_by_identities(
        db: &DbConn,
        identities: Vec<String>,
        limit: u64,
        cursor_filter: &Option<CursorFilter>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        Self::do_list_feed_events(db, limit, Some(identities), cursor_filter)
            .await
    }

    async fn do_list_feed_events(
        db: &DbConn,
        limit: u64,
        only_identities: Option<Vec<String>>,
        cursor_filter: &Option<CursorFilter>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        let cursor_filter = cursor_filter
            .as_ref()
            .unwrap_or(&CursorFilter::Forward(FeedCursor::Start));

        let mut query = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Collection.eq(FEED_COLLECTION));

        if let Some(identities) = only_identities {
            if identities.is_empty() {
                return Ok(Vec::new());
            }

            query =
                query.filter(EventModel::Column::Identity.is_in(identities));
        }

        let mut sea_cursor = query.cursor_by(FeedMarker::cols());
        sea_cursor.desc();

        match cursor_filter {
            CursorFilter::Forward(cur) => {
                match cur {
                    FeedCursor::Start => {}
                    FeedCursor::Mid(marker) => {
                        sea_cursor.after(marker.values());
                    }
                    FeedCursor::End => return Ok(vec![]),
                }

                sea_cursor.first(limit);
            }
            CursorFilter::Backward(cur) => {
                match cur {
                    FeedCursor::Start => return Ok(vec![]),
                    FeedCursor::Mid(marker) => {
                        sea_cursor.before(marker.values());
                    }
                    FeedCursor::End => {}
                }
                sea_cursor.last(limit);
            }
        }

        sea_cursor.all(db).await
    }

    /// Bulk-fetch events (with joined content) by their EventKey
    /// tuples. Keys missing a `signed_by` are skipped. Used to hydrate
    /// referenced posts (quote / repost targets) as `event_hints`.
    pub async fn list_events_by_keys(
        db: &DbConn,
        keys: &[crate::service::proto::EventKey],
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        let mut filter = Condition::any();
        let mut any_added = false;
        for key in keys {
            let Some(signed_by) = key.signed_by.as_ref() else {
                continue;
            };
            filter = filter.add(
                Condition::all()
                    .add(
                        EventModel::Column::Collection
                            .eq(key.collection as i16),
                    )
                    .add(EventModel::Column::Identity.eq(key.identity.clone()))
                    .add(
                        EventModel::Column::PublicKeyType
                            .eq(signed_by.key_type as i16),
                    )
                    .add(
                        EventModel::Column::PublicKey.eq(signed_by.key.clone()),
                    )
                    .add(EventModel::Column::Sequence.eq(key.sequence as i64)),
            );
            any_added = true;
        }
        if !any_added {
            return Ok(Vec::new());
        }

        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(filter)
            .all(db)
            .await
    }

    /// Fetch label events that target any of `keys`. Only labels from
    /// the trusted moderator are returned, using a join through
    /// `content_label` → `content` → `events` to check the label
    /// author's identity. Returns empty when no moderator is configured.
    pub async fn list_labels_for_event_keys(
        db: &DbConn,
        keys: &[TargetEventKey],
        trusted_moderator: Option<&str>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        let Some(moderator) = trusted_moderator else {
            return Ok(Vec::new());
        };

        if keys.is_empty() {
            return Ok(Vec::new());
        }

        // Create filtering clause for the relevant event keys
        let mut event_key_filter = Condition::any();
        for key in keys {
            event_key_filter = event_key_filter.add(
                Condition::all()
                    .add(
                        ContentLabelModel::Column::EventKeyCollection
                            .eq(key.collection),
                    )
                    .add(
                        ContentLabelModel::Column::EventKeyIdentity
                            .eq(key.identity.clone()),
                    )
                    .add(
                        ContentLabelModel::Column::EventKeyPublicKeyType
                            .eq(key.public_key_type),
                    )
                    .add(
                        ContentLabelModel::Column::EventKeyPublicKey
                            .eq(key.public_key.clone()),
                    )
                    .add(
                        ContentLabelModel::Column::EventKeySequence
                            .eq(key.sequence),
                    ),
            );
        }

        // Join label information with the identity that signed the label,
        // then filter based on the event key filter constructed above. Also,
        // only select events from the trusted moderator identity
        let mut query = SeaQuery::select();
        query
            .column((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::ContentId,
            ))
            .from(ContentLabelModel::Entity)
            .inner_join(
                ContentModel::Entity,
                Expr::col((
                    ContentLabelModel::Entity,
                    ContentLabelModel::Column::ContentId,
                ))
                .equals((ContentModel::Entity, ContentModel::Column::Id)),
            )
            .inner_join(
                EventModel::Entity,
                Expr::col((
                    EventModel::Entity,
                    EventModel::Column::ContentDigestType,
                ))
                .equals((
                    ContentModel::Entity,
                    ContentModel::Column::DigestType,
                ))
                .and(
                    Expr::col((
                        EventModel::Entity,
                        EventModel::Column::ContentDigestBytes,
                    ))
                    .equals((
                        ContentModel::Entity,
                        ContentModel::Column::DigestBytes,
                    )),
                ),
            )
            .and_where(
                Expr::col((EventModel::Entity, EventModel::Column::Identity))
                    .eq(moderator.to_owned()),
            )
            .and_where(event_key_filter.into());

        // Build the query
        let (sql, values) = query.build(PostgresQueryBuilder);
        let stmt = Statement::from_sql_and_values(
            db.get_database_backend(),
            &sql,
            values,
        );

        // Collect the content IDs that match the query
        #[derive(Debug, FromQueryResult)]
        struct LabelContentId {
            content_id: i64,
        }
        let label_ids: Vec<LabelContentId> =
            LabelContentId::find_by_statement(stmt).all(db).await?;
        let mut content_ids: Vec<i64> =
            label_ids.into_iter().map(|r| r.content_id).collect();
        content_ids.sort_unstable();
        content_ids.dedup();

        if content_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Return event entities that match the content IDs
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(ContentModel::Column::Id.is_in(content_ids))
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
        sequence: i64,
    ) -> Result<Option<EventWithContentRow>, DbErr> {
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

    /// Return the latest PROFILE event (highest `sequence`) per
    /// identity for each of `identities`. Used as `event_hints` on
    /// feed/thread responses so clients can populate author profiles
    /// without a follow-up round-trip.
    pub async fn list_latest_profiles_for_identities(
        db: &DbConn,
        identities: Vec<String>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        if identities.is_empty() {
            return Ok(Vec::new());
        }
        let rows = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Collection.eq(PROFILE_COLLECTION))
            .filter(EventModel::Column::Identity.is_in(identities))
            .order_by_desc(EventModel::Column::Sequence)
            .all(db)
            .await?;

        // Keep the first (highest-sequence) row per identity.
        let mut seen: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut deduped = Vec::with_capacity(rows.len());
        for row in rows {
            if seen.insert(row.0.identity.clone()) {
                deduped.push(row);
            }
        }
        Ok(deduped)
    }

    /// Bulk-fetch event rows by primary key, joining content. Order of the
    /// returned Vec is unspecified — caller reorders against the input list.
    pub async fn list_events_by_ids(
        db: &DbConn,
        ids: Vec<i64>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
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

    /// Get up to `limit` reaction events for the target post.
    /// Fetches in order of most-recent to least-recent so that we don't fetch
    /// outdated reactions from a user that have been superseded without also
    /// getting the newest one.
    /// Optionally, filter events to only include reactions with `emoji`.
    pub async fn get_reactions(
        db: &DbConn,
        target: &TargetEventKey,
        emoji: Option<&str>,
        limit: u64,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        let mut query = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            // Include content and reaction information:
            .join(JoinType::InnerJoin, content_join())
            .join(
                JoinType::InnerJoin,
                ContentModel::Entity::belongs_to(ContentReactionModel::Entity)
                    .from(ContentModel::Column::Id)
                    .to(ContentReactionModel::Column::ContentId)
                    .into(),
            )
            // Keep only reactions targetting the requested post:
            .filter(
                ContentReactionModel::Column::EventKeyCollection
                    .eq(target.collection),
            )
            .filter(
                ContentReactionModel::Column::EventKeyIdentity
                    .eq(target.identity.clone()),
            )
            .filter(
                ContentReactionModel::Column::EventKeyPublicKeyType
                    .eq(target.public_key_type),
            )
            .filter(
                ContentReactionModel::Column::EventKeyPublicKey
                    .eq(target.public_key.clone()),
            )
            .filter(
                ContentReactionModel::Column::EventKeySequence
                    .eq(target.sequence),
            )
            // Deterministically sort by newest
            .order_by_desc(EventModel::Column::CreatedAt)
            .order_by_desc(EventModel::Column::Id);

        // TODO: this is currently buggy when a user creates a new reaction
        // without deleting the old one.
        // We may filter out the newest reaction and send back an outdated reaction.
        // With no tombstone, it will be rendered as active.
        if let Some(emoji) = emoji {
            query = query.filter(ContentReactionModel::Column::Emoji.eq(emoji));
        }

        query.limit(limit).all(db).await
    }
}

/// Relation joining an event to its content row on (digest_type, digest_bytes).
pub(crate) fn content_join() -> RelationDef {
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
