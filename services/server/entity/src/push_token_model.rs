use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "push_token")]
pub struct Model {
    // Identity that registered this token.
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,

    // Push service name, matches PushService strum serialize value
    #[sea_orm(primary_key, auto_increment = false)]
    pub service: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub token: String,
}

impl ActiveModelBehavior for ActiveModel {}
