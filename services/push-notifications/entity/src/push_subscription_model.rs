use sea_orm::entity::prelude::*;

/// A registered push subscription:
/// each row is a subscription from one client for one identity.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "push_subscription")]
pub struct Model {
    // Public key that authenticated this subscription
    #[sea_orm(primary_key, auto_increment = false)]
    pub public_key_type: i16,
    #[sea_orm(primary_key, auto_increment = false)]
    pub public_key: Vec<u8>,
    // Identity whose notifications should be pushed
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,

    // Push service name, matches PushService strum serialize value
    pub service: String,
    pub token: String,

    pub created_at: TimeDateTimeWithTimeZone,
    pub updated_at: TimeDateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
