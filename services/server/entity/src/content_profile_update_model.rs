use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_profile_update")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,
    #[sea_orm(belongs_to, from = "content_id", to = "id")]
    pub parent: HasOne<super::content_model::Entity>,

    // Display name
    pub name: Option<String>,

    // Avatar image digest (no FK — resolved via query)
    pub avatar_digest_type: Option<i16>,
    pub avatar_digest_bytes: Option<Vec<u8>>,

    // Banner image digest (no FK — resolved via query)
    pub banner_digest_type: Option<i16>,
    pub banner_digest_bytes: Option<Vec<u8>>,
}

impl ActiveModelBehavior for ActiveModel {}
