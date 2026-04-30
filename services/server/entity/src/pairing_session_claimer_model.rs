use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "pair_identity_session_claimer")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub pairing_session_signature: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub key_type: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub key: Vec<u8>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::pairing_session_model::Entity",
        from = "Column::PairingSessionSignature",
        to = "super::pairing_session_model::Column::PairingSessionSignature",
        on_delete = "Cascade"
    )]
    PairingSession,
}

impl ActiveModelBehavior for ActiveModel {}
