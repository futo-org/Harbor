use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_identity_issue")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,

    // The public key being issued permissions
    pub issued_public_key_type: i16,
    pub issued_public_key: Vec<u8>,

    // Permissions granted (stored as comma-separated i32 values)
    pub permissions: String,
}

impl ActiveModelBehavior for ActiveModel {}
