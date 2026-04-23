use ::entity::push_token_model as PushTokenModel;
use sea_orm::sea_query::OnConflict;
use sea_orm::*;

pub struct Query;

impl Query {
    pub async fn tokens_for_identity(
        db: &DbConn,
        identity: &str,
    ) -> Result<Vec<PushTokenModel::Model>, DbErr> {
        PushTokenModel::Entity::find()
            .filter(PushTokenModel::Column::Identity.eq(identity))
            .all(db)
            .await
    }
}

pub struct Mutation;

impl Mutation {
    pub async fn register(
        db: &DbConn,
        identity: String,
        service: String,
        token: String,
    ) -> Result<(), DbErr> {
        let active = PushTokenModel::ActiveModel {
            identity: Set(identity),
            service: Set(service),
            token: Set(token),
        };

        PushTokenModel::Entity::insert(active)
            .on_conflict(
                OnConflict::columns([
                    PushTokenModel::Column::Identity,
                    PushTokenModel::Column::Service,
                    PushTokenModel::Column::Token,
                ])
                .do_nothing()
                .to_owned(),
            )
            .try_insert()
            .exec(db)
            .await?;

        Ok(())
    }

    pub async fn unregister(
        db: &DbConn,
        identity: &str,
        service: &str,
        token: &str,
    ) -> Result<(), DbErr> {
        PushTokenModel::Entity::delete_many()
            .filter(PushTokenModel::Column::Identity.eq(identity))
            .filter(PushTokenModel::Column::Service.eq(service))
            .filter(PushTokenModel::Column::Token.eq(token))
            .exec(db)
            .await?;

        Ok(())
    }
}
