use sea_orm::entity::prelude::*;

/// A moderator's decision on a report, keyed by `content_report.content_id`.
/// No row means open.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "report_resolution")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,
    #[sea_orm(belongs_to, from = "content_id", to = "id")]
    pub parent: HasOne<super::content::Entity>,

    // `ReportStatus` enum value.
    pub status: i16,
    pub resolved_by: String,
    pub resolved_at: DateTimeUtc,
}

impl ActiveModelBehavior for ActiveModel {}
