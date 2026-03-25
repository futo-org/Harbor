use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "events")]
pub struct Model {
    // ID used on the server for relations
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,
    #[sea_orm(unique_key = "event")]
    pub public_key_type: i8,
    #[sea_orm(unique_key = "event")]
    pub public_key: Vec<u8>,
    #[sea_orm(unique_key = "event")]
    pub logical_clock: i8,
    pub signature: Vec<u8>,

    #[sea_orm(has_one)]
    pub post: HasOne<super::post_model::Entity>,

    // Timestamp the client created the event
    pub created_at: TimeDateTime,
    // Timestamp the server received the event
    pub synced_at: TimeDateTime,
}

impl ActiveModelBehavior for ActiveModel {}
