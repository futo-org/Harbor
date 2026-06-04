use sea_orm::entity::prelude::*;

/// Signed events this service has created and published (the labels feed).
/// Keyed by the Event Key (collection, identity, signer, sequence);
/// references its content via the digest columns (see
/// `created_content_model`).
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "created_event")]
pub struct Model {
    ////
    // Start: Event Key (composite primary key)
    ////
    #[sea_orm(primary_key, auto_increment = false)]
    pub collection: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub public_key_type: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub public_key: Vec<u8>,
    #[sea_orm(primary_key, auto_increment = false)]
    pub sequence: i64,
    ////
    // End: Event Key
    ////

    // Content digest (joins to created_content).
    pub content_digest_type: Option<i32>,
    pub content_digest_bytes: Option<Vec<u8>>,

    pub signature: Vec<u8>,
    pub previous_signature: Vec<u8>,
    pub previous_root: Vec<u8>,

    // Raw signed `Event` bytes (non-deterministic serialization).
    pub event_bytes: Vec<u8>,

    // Timestamp the event was created (from the event's created_at).
    pub created_at: TimeDateTime,
}

impl ActiveModelBehavior for ActiveModel {}
