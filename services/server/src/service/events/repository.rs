use std::collections::HashMap;

use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use ::entity::reply_count_model as ReplyCountModel;
use polycentric_common::models::protos_v2::EventKey;
use sea_orm::sea_query::{Expr, IntoCondition};
use sea_orm::*;

use super::TargetEventKey;

pub struct Query;

impl Query {
    #[allow(clippy::too_many_arguments)]
    pub async fn list_events(
        db: &DbConn,
        mut limit: Option<u64>,
        collection: Option<i32>,
        identity: Option<String>,
        signed_by: Option<crate::service::proto::PublicKey>,
        sequence_gt: Option<i64>,
        sequence_lt: Option<i64>,
        heads: Vec<EventKey>,
    ) -> Result<Vec<(EventModel::Model, Option<ContentModel::Model>)>, DbErr>
    {
        if limit > Some(200) || limit.is_none() {
            limit = Some(200);
        }

        let mut query = EventModel::Entity::find()
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
                        .equals((
                            content_tbl,
                            ContentModel::Column::DigestBytes,
                        ))
                        .into_condition()
                    })
                    .into(),
            );

        if let Some(c) = collection {
            query = query.filter(EventModel::Column::Collection.eq(c as i16));
        }

        if let Some(id) = identity {
            query = query.filter(EventModel::Column::Identity.eq(id));
        }

        if let Some(pk) = signed_by {
            query = query.filter(
                Condition::all()
                    .add(
                        EventModel::Column::PublicKeyType
                            .eq(pk.key_type as i16),
                    )
                    .add(EventModel::Column::PublicKey.eq(pk.key)),
            );
        }

        if let Some(gt) = sequence_gt {
            query = query.filter(EventModel::Column::Sequence.gt(gt));
        }

        if let Some(lt) = sequence_lt {
            query = query.filter(EventModel::Column::Sequence.lt(lt));
        }

        for head in heads {
            let Some(signer) = head.signed_by else {
                continue;
            };

            // Require the event to either
            // (1) mismatch the head's collection, signer, or identity
            // (2) have a larger sequence number than the head
            query = query.filter(
                Condition::any()
                    .add(
                        EventModel::Column::Collection
                            .ne(head.collection as i16),
                    )
                    .add(EventModel::Column::Identity.ne(head.identity))
                    .add(
                        EventModel::Column::PublicKeyType
                            .ne(signer.key_type as i16),
                    )
                    .add(EventModel::Column::PublicKey.ne(signer.key))
                    .add(EventModel::Column::Sequence.gt(head.sequence as i64)),
            )
        }

        query
            .order_by_desc(EventModel::Column::Sequence)
            .limit(limit)
            .all(db)
            .await
    }

    /// Find the latest sequence numbers for an identity
    pub async fn list_heads(
        db: &DbConn,
        identity: &str,
    ) -> Result<Vec<HeadInfoRow>, DbErr> {
        EventModel::Entity::find()
            .select_only()
            .filter(EventModel::Column::Identity.eq(identity))
            .column(EventModel::Column::PublicKeyType)
            .column(EventModel::Column::PublicKey)
            .column(EventModel::Column::Collection)
            .column_as(EventModel::Column::Sequence.max(), "max_seq")
            .group_by(EventModel::Column::PublicKeyType)
            .group_by(EventModel::Column::PublicKey)
            .group_by(EventModel::Column::Collection)
            .into_model::<HeadInfoRow>()
            .all(db)
            .await
    }

    /// For each event in `events`, estimate the number of replies it has.
    /// Results are returned as a map from each event's key to its reply count.
    /// Any event without any replies will not be included in the output map.
    pub async fn count_replies(
        db: &DbConn,
        events: Vec<TargetEventKey>,
    ) -> Result<HashMap<TargetEventKey, i64>, DbErr> {
        if events.is_empty() {
            return Ok(HashMap::new());
        }

        let key_cols = [
            ReplyCountModel::Column::EventKeyCollection,
            ReplyCountModel::Column::EventKeyIdentity,
            ReplyCountModel::Column::EventKeyPublicKeyType,
            ReplyCountModel::Column::EventKeyPublicKey,
            ReplyCountModel::Column::EventKeySequence,
        ];

        // Keep only rows for event keys that we care about.
        let filter = {
            let key_tuples = events.into_iter().map(|k| {
                (
                    k.collection,
                    k.identity,
                    k.public_key_type,
                    k.public_key,
                    k.sequence,
                )
            });

            Expr::tuple(key_cols.map(Expr::col)).in_tuples(key_tuples)
        };

        // Fetch reply counts maintained by the stats worker.
        let rows = ReplyCountModel::Entity::find()
            .filter(filter)
            .all(db)
            .await?;

        // Store the reply counts as a map for efficient access.
        let map = rows
            .into_iter()
            .map(|row| {
                (
                    TargetEventKey {
                        collection: row.event_key_collection,
                        identity: row.event_key_identity,
                        public_key_type: row.event_key_public_key_type,
                        public_key: row.event_key_public_key,
                        sequence: row.event_key_sequence,
                    },
                    row.reply_count,
                )
            })
            .collect();

        Ok(map)
    }
}

#[derive(Debug, FromQueryResult)]
pub struct HeadInfoRow {
    pub public_key_type: i16,
    pub public_key: Vec<u8>,
    pub collection: i16,
    pub max_seq: i64,
}

pub struct Mutation;

impl Mutation {
    pub async fn add_event(
        db: &DbConn,
        active_model: EventModel::ActiveModel,
    ) -> Result<EventModel::Model, DbErr> {
        active_model.insert(db).await
    }
}
