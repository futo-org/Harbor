use crate::service::content::repository::split_event_key;
use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use ::entity::follow_model as FollowModel;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::{
    Content, Delete, EventKey, Follow,
};
use sea_orm::sea_query::{
    DeleteStatement, Expr, IntoCondition, SelectStatement,
};
use sea_orm::*;

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
    pub async fn add_event<C: ConnectionTrait>(
        db: &C,
        active_model: EventModel::ActiveModel,
        content: Option<&Content>,
    ) -> Result<(), DbErr> {
        let event = active_model.insert(db).await?;

        let Some(Content {
            content_body: Some(body),
        }) = content
        else {
            return Ok(());
        };
        match body {
            ContentBody::Follow(follow) => {
                Mutation::follow(db, &event, follow).await
            }
            ContentBody::Delete(delete) => Mutation::delete(db, delete).await,
            _ => Ok(()),
        }
    }

    async fn follow<C: ConnectionTrait>(
        db: &C,
        event: &EventModel::Model,
        follow: &Follow,
    ) -> Result<(), DbErr> {
        FollowModel::ActiveModel {
            event_id: Set(event.id),
            follower: Set(event.identity.clone()),
            followee: Set(follow.identity.clone()),
        }
        .insert(db)
        .await?;

        Ok(())
    }

    async fn delete<C: ConnectionTrait>(
        db: &C,
        delete: &Delete,
    ) -> Result<(), DbErr> {
        let key = split_event_key(delete.event_key.clone(), "delete content")
            .map_err(|err| DbErr::Custom(err.message().into()))?;

        if key.collection != collections::SOCIAL_GRAPH as i16 {
            return Ok(());
        }

        let mut event_id = SelectStatement::new();
        event_id
            .column(EventModel::Column::Id)
            .from(EventModel::Entity)
            .and_where(EventModel::Column::Collection.eq(key.collection))
            .and_where(EventModel::Column::Identity.eq(key.identity))
            .and_where(
                EventModel::Column::PublicKeyType.eq(key.public_key_type),
            )
            .and_where(EventModel::Column::PublicKey.eq(key.public_key))
            .and_where(EventModel::Column::Sequence.eq(key.sequence));

        let mut query = DeleteStatement::new();
        query
            .from_table(FollowModel::Entity)
            .cond_where(FollowModel::Column::EventId.in_subquery(event_id));

        db.execute(&query).await?;
        Ok(())
    }
}
