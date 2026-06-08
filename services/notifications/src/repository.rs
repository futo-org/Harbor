use notifications_entity::push_token_model as PushTokenModel;
use polycentric_common::models::protos_v2::PublicKey;
use sea_orm::sea_query::OnConflict;
use sea_orm::*;

pub struct Query;

impl Query {
    pub async fn token_for_public_key(
        db: &DbConn,
        public_key: &PublicKey,
    ) -> Result<Option<PushTokenModel::Model>, DbErr> {
        PushTokenModel::Entity::find()
            .filter(PushTokenModel::Column::PublicKeyType.eq(public_key.key_type as i16))
            .filter(PushTokenModel::Column::PublicKey.eq(public_key.key.clone()))
            .one(db)
            .await
    }
}

pub struct Mutation;

impl Mutation {
    pub async fn register(
        db: &DbConn,
        public_key: &PublicKey,
        service: String,
        token: String,
    ) -> Result<(), DbErr> {
        let now = time::OffsetDateTime::now_utc();
        let created_at = time::PrimitiveDateTime::new(now.date(), now.time());

        let active = PushTokenModel::ActiveModel {
            public_key_type: Set(public_key.key_type as i16),
            public_key: Set(public_key.key.clone()),
            service: Set(service),
            token: Set(token),
            created_at: Set(created_at),
        };

        PushTokenModel::Entity::insert(active)
            .on_conflict(
                OnConflict::columns([
                    PushTokenModel::Column::PublicKeyType,
                    PushTokenModel::Column::PublicKey,
                ])
                .update_columns([
                    PushTokenModel::Column::Service,
                    PushTokenModel::Column::Token,
                ])
                .to_owned(),
            )
            .exec(db)
            .await?;

        Ok(())
    }

    pub async fn unregister(
        db: &DbConn,
        public_key: &PublicKey,
        service: &str,
        token: &str,
    ) -> Result<(), DbErr> {
        PushTokenModel::Entity::delete_many()
            .filter(PushTokenModel::Column::PublicKeyType.eq(public_key.key_type as i16))
            .filter(PushTokenModel::Column::PublicKey.eq(public_key.key.clone()))
            .filter(PushTokenModel::Column::Service.eq(service))
            .filter(PushTokenModel::Column::Token.eq(token))
            .exec(db)
            .await?;

        Ok(())
    }
}
