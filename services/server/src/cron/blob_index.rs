//! Job to sync the local (in db) blob index with the content store.

use std::mem::replace;
use std::time::Instant;

use chrono::{DateTime, Utc};
use entity::blob_index;
use polycentric_common::models::protos_v2::{ContentDigest, ContentDigestType};
use sea_orm::ActiveValue;
use tokio_stream::StreamExt;

use crate::db::{Connection, DbConn};
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::content::content_repository::Mutation;

/// Number of blobs to insert into the table in one query.
const BATCH_SIZE: usize = 200;

/// # Notes
///
/// This one way sync, it only adds the blobs locally that are in the content
/// store, but not in the local index. It doesn't remove blobs from the local
/// index that aren't in the content store any more.
pub(crate) async fn sync(
    mut db: DbConn,
    filestore: ContentFilestore,
) -> Result<(), String> {
    let start = Instant::now();
    tracing::info!("synchronising blob index with content store");

    let mut processed = 0;
    let mut skipped = 0;
    let mut added = 0;

    tracing::debug!("listing blobs in content store");
    let mut objects = filestore.list_objects(None /* No prefix. */);
    let mut buffer = Vec::with_capacity(BATCH_SIZE);
    loop {
        let object = match objects.next().await {
            Some(Ok(object)) => object,
            Some(Err(error)) => {
                tracing::warn!(%error, "failed to list objects in content store");
                return Err(error.to_string());
            }
            None => break, // Processed all.
        };

        // Skip blob without a key (seems unlikely).
        let Some(key) = object.key else {
            tracing::debug!("skipped object without key");
            skipped += 1;
            continue;
        };
        let (digest_type, digest_value) = match ContentDigest::from_id(&key) {
            Some(digest) => (digest.r#type, digest.value),
            None => {
                tracing::warn!(%key, "object has an unexpected key format");
                (ContentDigestType::Unspecified as i32, Vec::new())
            }
        };
        let size = object.size.unwrap_or(0);
        let last_modified = match object.last_modified {
            Some(last_modified) => {
                DateTime::from_timestamp_nanos(last_modified.as_nanos() as i64)
            }
            None => Utc::now(),
        };

        buffer.push(blob_index::ActiveModel {
            key: ActiveValue::Set(key),
            digest_type: ActiveValue::Set(digest_type),
            digest_value: ActiveValue::Set(digest_value),
            size: ActiveValue::Set(size),
            last_modified: ActiveValue::Set(last_modified.into()),
        });

        if buffer.len() == buffer.capacity() {
            let blobs = replace(&mut buffer, Vec::with_capacity(BATCH_SIZE));
            update_blob_index(&mut db, blobs, &mut processed, &mut added)
                .await?;
        }
    }

    if !buffer.is_empty() {
        update_blob_index(&mut db, buffer, &mut processed, &mut added).await?;
    }

    tracing::info!(processed, skipped, added, elapsed = ?start.elapsed(), "synced blob index");
    Ok(())
}

async fn update_blob_index<C: Connection>(
    db: &mut C,
    blobs: Vec<blob_index::ActiveModel>,
    processed: &mut u64,
    added: &mut u64,
) -> Result<(), String> {
    *processed += blobs.len() as u64;
    match Mutation::update_blob_index(db, blobs).await {
        Ok(a) => Ok(*added += a),
        Err(error) => {
            tracing::warn!(%error, "failed update blob index");
            return Err(error.to_string());
        }
    }
}
