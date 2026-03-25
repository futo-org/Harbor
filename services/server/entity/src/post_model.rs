use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "event_content_post")]
pub struct Model {
    // ID of the event
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i64,
    #[sea_orm(belongs_to, from = "id", to = "id")]
    pub event: HasOne<super::event_model::Entity>,
    // Content of the post
    pub content: String,
}

impl ActiveModelBehavior for ActiveModel {}
