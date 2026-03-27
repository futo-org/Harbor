use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_reaction")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,
    #[sea_orm(belongs_to, from = "content_id", to = "id")]
    pub parent: HasOne<super::content_model::Entity>,

    // EventKey of the event being reacted to
    pub event_key_stream_id: String,
    pub event_key_public_key_type: i16,
    pub event_key_public_key: Vec<u8>,
    pub event_key_sequence: i64,

    // Optional emoji
    pub emoji: Option<String>,
    // Opinion (0=unspecified, 1=like, 2=dislike, 3=neutral)
    pub opinion: i16,
}

impl ActiveModelBehavior for ActiveModel {}
