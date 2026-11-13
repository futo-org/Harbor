//! Model for the `blob_index` table.

use sea_orm::entity::prelude::*;

/// Index of blobs uploaded to the content store.
///
/// Note that this may be out of data, the source of thruth in the content
/// store.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "blob_index")]
pub struct Model {
    /// Key of the blob.
    #[sea_orm(primary_key, auto_increment = false)]
    pub key: String,
    /// See [`ContentDigest::type`].
    ///
    /// [`ContentDigest::type`]: polycentric_common::models::protos_v2::ContentDigest::type
    pub digest_type: i32,
    /// See [`ContentDigest::value`].
    ///
    /// [`ContentDigest::value`]: polycentric_common::models::protos_v2::ContentDigest::value
    pub digest_value: Vec<u8>,
    /// Size of the blob.
    pub size: i64,
    /// Time at which the blobs was last modified.
    pub last_modified: DateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
