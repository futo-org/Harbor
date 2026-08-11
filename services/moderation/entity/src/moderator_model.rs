use sea_orm::entity::prelude::*;

/// For moderator identities, this service should ingest their report events and sign corresponding
/// label events. Note that these moderators are managed independently of the server's moderators,
/// and may be distinct.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "moderator")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,
    pub created_at: TimeDateTimeWithTimeZone,
    pub updated_at: TimeDateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
