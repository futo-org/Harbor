use sea_orm::entity::prelude::*;

/// Maps a legacy (v1) system key to the new v2 identity the migrator created
/// for it. `legacy_system_key` is the lowercase hex of the raw key bytes - the
/// same value the HTTP lookup endpoint takes as its path parameter.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "migrated_identity")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub legacy_system_key: String,
    /// Legacy key type (v1 `PublicKey.key_type`; 1 = ed25519).
    pub legacy_key_type: i64,
    /// Derived v2 identity string (`Identity::derive_hex_key`).
    pub identity: String,
    /// Migration status for this system, e.g. `pending` / `complete`.
    pub status: String,
    pub created_at: TimeDateTimeWithTimeZone,
    pub updated_at: TimeDateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
