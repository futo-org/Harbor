use sea_orm::entity::prelude::*;

/// Well-known flag values. Any string is storable; these are the ones the
/// server currently acts on.
pub const FLAG_MODERATOR: &str = "moderator";
pub const FLAG_BANNED: &str = "banned";

/// A server-administered flag on an identity, one row per identity+flag
/// pair. Presence of a row means the flag is set.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "identity_flag")]
pub struct Model {
    // sha256 hash of the initial Identity content; matches
    // `content_identity.identity`. Not FK'd because identity is derived
    // from the identity event stream.
    #[sea_orm(primary_key, auto_increment = false)]
    pub identity: String,

    // Flag name, e.g. "moderator" or "banned" (see FLAG_* constants).
    #[sea_orm(primary_key, auto_increment = false)]
    pub flag: String,

    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

impl ActiveModelBehavior for ActiveModel {}
