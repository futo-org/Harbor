use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "content_identity_claim")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub content_id: i64,

    // The identity being claimed (IdentityId.value)
    pub claimed_identity_id: Vec<u8>,
}

impl ActiveModelBehavior for ActiveModel {}
