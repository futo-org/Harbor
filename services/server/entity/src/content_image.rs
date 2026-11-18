use sea_orm::entity::prelude::*;

/// Image that is part of an event.
///
/// This can be part of one of the following events (any event with an
/// `Image`/`ImageSet`):
///  * `Post`
///  * `ProfileUpdate`
///  * `VerificationClaim`
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_image")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,
    #[sea_orm(belongs_to, from = "content_id", to = "id")]
    pub parent: HasOne<super::content::Entity>,

    // From `Blob`.
    // Blob digest (no FK — resolved via query)
    pub digest_type: i16,
    pub digest_bytes: Vec<u8>,
    pub size: i64,
    pub mime_type: String,

    // From `Image`.
    pub width: i32,
    pub height: i32,
}

impl ActiveModelBehavior for ActiveModel {}
