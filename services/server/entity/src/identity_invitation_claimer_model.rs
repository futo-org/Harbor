use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "identity_invitation_claimer")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub invite_code: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub key_type: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub key: Vec<u8>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::identity_invitation_model::Entity",
        from = "Column::InviteCode",
        to = "super::identity_invitation_model::Column::InviteCode",
        on_delete = "Cascade"
    )]
    Invitation,
}

impl ActiveModelBehavior for ActiveModel {}
