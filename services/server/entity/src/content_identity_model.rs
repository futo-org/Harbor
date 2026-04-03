use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_identity")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,

    // The self-signed identity ID (signature of the public key)
    pub identity_id: Vec<u8>,

    // The initial public key that created this identity
    pub initial_public_key_type: i16,
    pub initial_public_key: Vec<u8>,
}

impl ActiveModelBehavior for ActiveModel {}
