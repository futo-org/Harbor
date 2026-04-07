use crate::service::identity::identity_repository as IdentityRepository;
use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use sea_orm::sea_query::{Expr, IntoCondition};
use sea_orm::*;

pub struct Query;

impl Query {
    pub async fn list_events(
        db: &DbConn,
        mut limit: Option<u64>,
        stream_id: Option<String>,
        identity_id: Option<Vec<u8>>,
        signed_by: Option<crate::service::proto::PublicKey>,
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

        if stream_id.is_some() {
            query = query.filter(EventModel::Column::StreamId.eq(stream_id));
        }

        if let Some(id) = identity_id {
            let authorized_keys =
                IdentityRepository::Query::authorized_keys(db, &id).await?;

            if authorized_keys.is_empty() {
                return Ok(vec![]);
            }

            let mut key_condition = Condition::any();
            for ak in &authorized_keys {
                let mut cond = Condition::all()
                    .add(
                        EventModel::Column::PublicKeyType
                            .eq(ak.key.key_type as i16),
                    )
                    .add(EventModel::Column::PublicKey.eq(ak.key.key.clone()));

                // If this key was revoked, only include events created before
                // the revocation time.
                if let Some(revoked_at) = ak.revoked_at {
                    cond =
                        cond.add(EventModel::Column::CreatedAt.lt(revoked_at));
                }

                key_condition = key_condition.add(cond);
            }
            query = query.filter(key_condition);
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

        query
            .order_by_asc(EventModel::Column::Id)
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
