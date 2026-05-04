use ::entity::content_follow_model as ContentFollowModel;
use ::entity::content_model as ContentModel;
use ::entity::content_post_model as ContentPostModel;
use ::entity::event_model as EventModel;
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

    /// Return Feed events that are direct replies to the given parent
    /// EventKey, newest first.
    pub async fn list_replies_by_parent_event_key(
        db: &DbConn,
        collection: i16,
        identity: &str,
        public_key_type: i16,
        public_key: Vec<u8>,
        sequence: i16,
        limit: u64,
    ) -> Result<Vec<FeedRow>, DbErr> {
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .join(JoinType::InnerJoin, content_post_join())
            .filter(EventModel::Column::Collection.eq(FEED_COLLECTION))
            .filter(
                ContentPostModel::Column::ReplyParentCollection.eq(collection),
            )
            .filter(ContentPostModel::Column::ReplyParentIdentity.eq(identity))
            .filter(
                ContentPostModel::Column::ReplyParentPublicKeyType
                    .eq(public_key_type),
            )
            .filter(
                ContentPostModel::Column::ReplyParentPublicKey.eq(public_key),
            )
            .filter(ContentPostModel::Column::ReplyParentSequence.eq(sequence))
            .order_by_desc(EventModel::Column::CreatedAt)
            .limit(limit)
            .all(db)
            .await
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

/// Relation joining a content row to its content_post row on content id.
fn content_post_join() -> RelationDef {
    ContentModel::Entity::belongs_to(ContentPostModel::Entity)
        .from(ContentModel::Column::Id)
        .to(ContentPostModel::Column::ContentId)
        .into()
}
