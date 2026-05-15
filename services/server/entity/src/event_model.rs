use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "events")]
pub struct Model {
    // ID used on the server for relations only. This is not the Event Key or used on clients.
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,

    ////
    // Start: Event Key
    ////
    // Collection the event belongs to (1=Identity, 2=Feed, 3=Interactions)
    #[sea_orm(unique_key = "event_key")]
    pub collection: i16,
    // Identity key (sha256 hash of the initial Identity content)
    #[sea_orm(unique_key = "event_key")]
    pub identity: String,
    #[sea_orm(unique_key = "event_key")]
    pub public_key_type: i16,
    #[sea_orm(unique_key = "event_key")]
    pub public_key: Vec<u8>,
    #[sea_orm(unique_key = "event_key")]
    pub sequence: i64,
    ////
    // End: Event Key
    ////

    // Content digest (denormalized for joining to content table, optional)
    pub content_digest_type: Option<i32>,
    pub content_digest_bytes: Option<Vec<u8>>,

    // Signatures
    pub signature: Vec<u8>,
    pub previous_signature: Vec<u8>,

    // We need to store the raw event due to non-deterministic serialization
    pub event_bytes: Vec<u8>,

    // Timestamp the client created the event
    pub created_at: TimeDateTime,
    // Timestamp the server received the event
    pub synced_at: TimeDateTime,
}

impl ActiveModelBehavior for ActiveModel {}
