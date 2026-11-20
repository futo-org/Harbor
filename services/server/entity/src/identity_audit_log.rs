//! Model for the `identity_audit_log` table.

use sea_orm::entity::prelude::*;

/// The identity ledger hold various action performed by or to an identity.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "identity_audit_log")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i64,
    pub identity: String,
    pub action: Action,
    /// Action was performend by the identity.
    ///
    /// This is retrieved from the JWT token's payload "iss" field.
    ///
    /// # Notes
    ///
    /// At least of the `by_*` fields must be not null.
    pub by_identity: Option<String>,
    /// Action was performend by a public key.
    ///
    /// This is retrieved from the JWT token's header "kid" field.
    pub by_public_key: Option<String>,
    pub timestamp: DateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}

/// Action performed by or to an identity.
#[derive(Copy, Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "i16", db_type = "SmallInteger")]
pub enum Action {
    /// Identity was seen for the first time.
    FirstSeen = 1,
    /// Identity was deleted.
    Deleted = 2,
    /// Identity was banned.
    Banned = 3,
    /// Identity was unbanned.
    Unbanned = 4,
}
