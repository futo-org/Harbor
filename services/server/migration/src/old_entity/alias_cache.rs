use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "alias_cache")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub alias: String,
    pub identity: Option<String>,
    pub updated_at: DateTimeUtc,
}

impl ActiveModelBehavior for ActiveModel {}
