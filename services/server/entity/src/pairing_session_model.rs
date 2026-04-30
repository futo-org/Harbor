use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "pair_identity_session")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub pairing_session_signature: String,
    pub signed_by_key_type: i32,
    pub signed_by_key: Vec<u8>,
    // sha256 hash of the initial Identity content; matches `content_identity.identity`.
    // Not FK'd because identity is derived from the identity event stream.
    pub issuer_identity: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
