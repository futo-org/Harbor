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
    /// Who performed the action.
    ///
    /// `by_identity` and `by_public_key` must be set if this is
    /// [`PerformedBy::Identity`].
    pub by: PerformedBy,
    /// Action was performend by the identity.
    ///
    /// This is retrieved from the JWT token's payload "iss" field.
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
    /// The identity's data was removed.
    DataRemoved = 5,
}

/// Who performed the action.
#[derive(Copy, Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "i16", db_type = "SmallInteger")]
pub enum PerformedBy {
    /// System (the server) performed the action.
    System = 1,
    /// Performed by the admin CLI.
    AdminCli = 2,
    /// Performed via the gRPC API by an identity.
    ///
    /// See [`by_identity`] and [`by_public_key`] fields.
    ///
    /// [`by_identity`]: Model::by_identity
    /// [`by_public_key`]: Model::by_public_key
    Identity = 3,
}
