use sea_orm::entity::prelude::*;

/// Serialized `Content` messages this service has created (currently
/// `Labels`), keyed by their content digest. Mirrors the digest-keyed
/// content storage on the servers.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "created_content")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub digest_type: i32,

    #[sea_orm(primary_key, auto_increment = false)]
    pub digest_bytes: Vec<u8>,

    // Serialized `Content` proto (the bytes the digest is taken over).
    pub serialized_bytes: Vec<u8>,

    pub created_at: TimeDateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
