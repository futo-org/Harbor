use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "identity_invitation")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub invite_code: String,
    // sha256 hash of the initial Identity content; matches `content_identity.identity`.
    // Not FK'd because identity is derived from the identity event stream.
    pub identity: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub ttl_seconds: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
