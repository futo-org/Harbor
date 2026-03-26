use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content")]
pub struct Model {
    // ID used on the server for relations only
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,

    #[sea_orm(unique_key = "digest")]
    pub digest_type: i8,

    #[sea_orm(unique_key = "digest")]
    pub digest_bytes: Vec<u8>,

    // Reference to any events that use the content
    #[sea_orm(has_many)]
    pub events: HasMany<super::event_model::Entity>,

    // References to the individual content types
    #[sea_orm(has_one)]
    pub post: HasOne<super::post_model::Entity>,
    #[sea_orm(has_one)]
    pub delete: HasOne<super::delete_model::Entity>,
    #[sea_orm(has_one)]
    pub follow: HasOne<super::follow_model::Entity>,
    #[sea_orm(has_one)]
    pub block: HasOne<super::block_model::Entity>,
    #[sea_orm(has_one)]
    pub reaction: HasOne<super::reaction_model::Entity>,
    #[sea_orm(has_one)]
    pub profile_update: HasOne<super::profile_update_model::Entity>,
    #[sea_orm(has_one)]
    pub image: HasOne<super::image_model::Entity>,
    #[sea_orm(has_one)]
    pub blob: HasOne<super::blob_model::Entity>,

    // Timestamp the server received the content
    pub synced_at: TimeDateTime,
}

impl ActiveModelBehavior for ActiveModel {}
