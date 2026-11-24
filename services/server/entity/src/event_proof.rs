//! Model for the `event_proof` table.

use sea_orm::entity::prelude::*;

/// The `EventProof` of each stored event that a revoked key signed.
/// Rebuilt when the identity's IDENTITY events change.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "event_proof")]
pub struct Model {
    /// The proven event (`events` table).
    #[sea_orm(primary_key, auto_increment = false)]
    pub event_id: i64,
    /// Same as `events.identity`.
    pub identity: String,
    /// Same as `events.signature`.
    pub signature: Vec<u8>,
    pub target_signature: Vec<u8>,
    pub leaf_index: i64,
    /// The audit path's 32-byte hashes, one after another.
    pub audit_path: Vec<u8>,
}

impl ActiveModelBehavior for ActiveModel {}
