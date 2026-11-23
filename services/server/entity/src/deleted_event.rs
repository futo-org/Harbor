//! Model for the `deleted_event` table.

use sea_orm::entity::prelude::*;

use crate::event;

/// Deleted [event].
///
/// This table holds all events for identity that has been (soft) deleted. After
/// a grace period a cron job will clean up all resources these events
/// reference, e.g. by deleting them from the cache tables, and delete them from
/// this table as well.
///
/// [event]: event
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "deleted_event")]
pub struct Model {
    // Columns from [`Event`].
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,
    #[sea_orm(unique_key = "event_key")]
    pub collection: i16,
    #[sea_orm(unique_key = "event_key")]
    pub identity: String,
    #[sea_orm(unique_key = "event_key")]
    pub public_key_type: i16,
    #[sea_orm(unique_key = "event_key")]
    pub public_key: Vec<u8>,
    #[sea_orm(unique_key = "event_key")]
    pub sequence: i64,
    pub content_digest_type: Option<i32>,
    pub content_digest_bytes: Option<Vec<u8>>,
    pub signature: Vec<u8>,
    pub previous_signature: Vec<u8>,
    pub previous_root: Vec<u8>,
    pub application_id: Option<i32>,
    pub event_bytes: Vec<u8>,
    pub created_at: DateTimeWithTimeZone,
    pub synced_at: DateTimeWithTimeZone,
    pub content_type: Option<i16>,
}

impl ActiveModelBehavior for ActiveModel {}

/// Type check that ensures the deleted event has the same columns and the
/// non-deleted version.
#[allow(dead_code)]
fn deleted_event_columns_same_as_not_deleted(event: event::Model) -> Model {
    let event::Model {
        id,
        collection,
        identity,
        public_key_type,
        public_key,
        sequence,
        content_digest_type,
        content_digest_bytes,
        signature,
        previous_signature,
        previous_root,
        application_id,
        event_bytes,
        created_at,
        synced_at,
        content_type,
    } = event;
    Model {
        id,
        collection,
        identity,
        public_key_type,
        public_key,
        sequence,
        content_digest_type,
        content_digest_bytes,
        signature,
        previous_signature,
        previous_root,
        application_id,
        event_bytes,
        created_at,
        synced_at,
        content_type,
    }
}
