//! Model for the `identity_document` table.

use sea_orm::entity::prelude::*;

/// The event holding each identity's latest valid `Identity`.
/// Rebuilt when the identity's IDENTITY events change.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "identity_document")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,
    /// Head of the identity chain (`events` table).
    pub event_id: i64,
}

impl ActiveModelBehavior for ActiveModel {}
