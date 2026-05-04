use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "push_token")]
pub struct Model {
    // Public key that registered this token
    #[sea_orm(primary_key, auto_increment = false)]
    pub public_key_type: i16,
    #[sea_orm(primary_key, auto_increment = false)]
    pub public_key: Vec<u8>,

    // Push service name, matches PushService strum serialize value
    pub service: String,
    pub token: String,

    pub created_at: TimeDateTime,
}

impl ActiveModelBehavior for ActiveModel {}
