use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_identity_revoke")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,

    // Serialized Identity message bytes
    pub identity_id: Vec<u8>,

    // The public key being revoked
    pub revoked_public_key_type: i16,
    pub revoked_public_key: Vec<u8>,
}

impl ActiveModelBehavior for ActiveModel {}
