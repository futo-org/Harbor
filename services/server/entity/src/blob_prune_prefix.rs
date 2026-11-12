//! Model for the `blob_prune_prefix` table.

use sea_orm::entity::prelude::*;

/// Blob prefixes that split the blob prune job into multiple sub-jobs.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "blob_prune_prefix")]
pub struct Model {
    /// Blob prefix.
    ///
    /// Blobs are named using the id created by `ContentDigest::to_id`. This
    /// uses a hexidecimal representation of the bytes that make up the digest
    /// of the blob. The digest type prefix (e.g. "1_") is added by the blob
    /// prune job and must not be part of the prefix. The prefix is only related
    /// to part after the type prefix. Hence this must only contain valid
    /// hexidecimal digits, i.e. "A" through "F" or "0" through "9", as the
    ///
    /// The minimum length is 0, while the maximum length is 4.
    #[sea_orm(primary_key, auto_increment = false)]
    pub prefix: String,
    /// Time at which the blobs with the prefix were last checked.
    pub last_checked: DateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
