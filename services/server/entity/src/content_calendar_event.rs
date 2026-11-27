use sea_orm::entity::prelude::*;

/// One row per `CalendarEvent`. `search_data` is generated
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "content_calendar_event")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,
    #[sea_orm(belongs_to, from = "content_id", to = "id")]
    pub parent: HasOne<super::content::Entity>,

    pub title: String,
    pub description: Option<String>,
    pub start_at: DateTimeWithTimeZone,
    pub end_at: Option<DateTimeWithTimeZone>,
    pub all_day: bool,
    /// IANA name, for showing the times as the creator set them
    pub timezone: Option<String>,
    pub labels: Vec<String>,

    pub location_name: Option<String>,
    pub location_address: Option<String>,
    pub location_url: Option<String>,
    // WGS84 degrees
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

impl ActiveModelBehavior for ActiveModel {}
