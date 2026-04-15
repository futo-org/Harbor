use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use sea_orm::sea_query::{Expr, IntoCondition};
use sea_orm::*;

pub struct Query;

impl Query {
    pub async fn list_events(
        db: &DbConn,
        mut limit: Option<u64>,
        collection: Option<i32>,
        identity: Option<String>,
        signed_by: Option<crate::service::proto::PublicKey>,
        sequence_gt: Option<i64>,
        sequence_lt: Option<i64>,
    ) -> Result<Vec<(EventModel::Model, Option<ContentModel::Model>)>, DbErr>
    {
        if limit > Some(200) {
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
            query = query.filter(EventModel::Column::Sequence.gt(gt as i16));
        }

        if let Some(lt) = sequence_lt {
            query = query.filter(EventModel::Column::Sequence.lt(lt as i16));
        }

        query
            .order_by_desc(EventModel::Column::Sequence)
            .limit(limit)
            .all(db)
            .await
    }
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
