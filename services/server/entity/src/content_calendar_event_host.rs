use sea_orm::entity::prelude::*;

/// One row per host named by a `CalendarEvent`
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_calendar_event_host")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,
    #[sea_orm(belongs_to, from = "content_id", to = "id")]
    pub parent: HasOne<super::content::Entity>,

    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,
}

impl ActiveModelBehavior for ActiveModel {}
