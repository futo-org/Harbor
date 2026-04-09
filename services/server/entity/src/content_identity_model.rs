use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_identity")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,

    // Identity key (sha256 hash of the initial Identity content)
    pub identity: String,

    // Serialized Identity proto bytes (contains rotation_keys and signing_keys)
    pub identity_bytes: Vec<u8>,
}

impl ActiveModelBehavior for ActiveModel {}
