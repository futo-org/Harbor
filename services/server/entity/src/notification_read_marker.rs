use sea_orm::entity::prelude::*;

/// Per-identity read marker for notifications: every `notification` row
/// with `id <= last_read_id` addressed to `identity` counts as read.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "notification_read_marker")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,
    pub last_read_id: i64,
    pub updated_at: DateTimeUtc,
}

impl ActiveModelBehavior for ActiveModel {}
