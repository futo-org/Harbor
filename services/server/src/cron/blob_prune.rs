//! Cron job that prunes unused blobs from the objects store.

use std::cmp::max;
use std::ops::ControlFlow;
use std::time::{Duration, Instant, SystemTime};

use chrono::Utc;
use polycentric_common::models::protos_v2::ContentDigest;
use sea_orm::DatabaseConnection;
use tokio_stream::StreamExt;

use crate::config;
use crate::cron::{AdvisoryLock, Cron};
use crate::db::DbConn;
use crate::service::content::content_filestore::{ContentFilestore, DateTime};
use crate::service::content::repository::Query;

/// Duration between two checks.
const TIME_BETWEEN_CHECKS: Duration = Duration::from_hours(6);

/// Duration before we try again on error.
const ERROR_RETRY: Duration = Duration::from_hours(1);

pub(crate) fn run(
    cron: &Cron,
    db: DatabaseConnection,
    filestore: ContentFilestore,
) {
    cron.repeated(move || {
        let grace_period = config::get().blob_prune_grace;
        let minimum_age = DateTime::from(SystemTime::now() - grace_period);
        tracing::debug!(?grace_period, ?minimum_age, "pruning blobs");
        let db = db.clone();
        let filestore = filestore.clone();
        async move {
            let start = Instant::now();
            let mut conn = match DbConn::from_pool(&db).await {
                Ok(conn) => conn,
                Err(error) => {
                    tracing::warn!(%error, "failed acquire database connection");
                    return ControlFlow::Continue(ERROR_RETRY);
                },
            };
            drop(db); // Don't use the pool any more.

            let mut total_processed = 0;
            let mut total_skipped = 0;
            let mut total_deleted = 0;

            let mut last_prefix = None;
            loop {
                let prefix = match Query::blob_prune_next_prefix(&mut conn, TIME_BETWEEN_CHECKS, last_prefix.as_deref()).await {
                    Ok(Some(prefix)) => prefix,
                    Ok(None) => break,
                    Err(error) => {
                        tracing::warn!(%error, "failed get next blob prefix to check");
                        return ControlFlow::Continue(ERROR_RETRY);
                    },
                };
                let start_prefix = Instant::now();
                tracing::debug!(%prefix, "pruning blobs with prefix");

                let mut tx = match conn.begin().await {
                    Ok(tx) => tx,
                    Err(error) => {
                        tracing::warn!(%error, "failed to start transaction");
                        return ControlFlow::Continue(ERROR_RETRY);
                    },
                };

                match AdvisoryLock::blob_prune(&prefix).try_lock(&mut tx).await {
                    Ok(true) => {},
                    Ok(false) => {
                        tracing::debug!(%prefix, "prune blob prefix lock is locked, skipping");
                        if let Err(error) = tx.rollback().await {
                            tracing::warn!(%error, "failed to abort transaction");
                        }
                        last_prefix = Some(prefix);
                        continue;
                    },
                    Err(error) => {
                        tracing::warn!(%error, "failed acquire blob prune lock");
                        if let Err(error) = tx.rollback().await {
                            tracing::warn!(%error, "failed to abort transaction");
                        }
                        return ControlFlow::Continue(ERROR_RETRY);
                    }
                };

                let mut processed = 0;
                let mut skipped = 0;
                let mut deleted = 0;

                for digest_type in ContentDigest::all_known_types() {
                    let blob_prefix = format!("{}_{prefix}", digest_type as i32);
                    tracing::debug!(%prefix, %blob_prefix, "fetching blobs from object storage");
                    let mut objects = filestore.list_objects(Some(blob_prefix));
                    loop {
                        let object = match objects.next().await {
                            Some(Ok(object)) => object,
                            Some(Err(error)) => {
                                tracing::warn!(%prefix, %error, "failed to list objects with prefix");
                                return ControlFlow::Continue(ERROR_RETRY);
                            },
                            None => break, // Processed all.
                        };
                        processed += 1;

                        // Skip blob without a key (seems unlikely), that are too
                        // recently modified (created) and don't have the expected key
                        // format.
                        let Some(key) = object.key else {
                            tracing::debug!("skipped object without key");
                            skipped += 1;
                            continue;
                        };
                        if let Some(last_modified) = object.last_modified && last_modified <= minimum_age {
                            tracing::debug!(%key, "skipped object that is too young");
                            skipped += 1;
                            continue;
                        };
                        let Some(digest) = ContentDigest::from_id(&key) else {
                            tracing::debug!(%key, "skipped object as it has the wrong key format");
                            skipped += 1;
                            continue;
                        };

                        let has_event = match Query::blob_has_event(&mut tx, digest.r#type, &digest.value).await {
                            Ok(has_event) => has_event,
                            Err(error) => {
                                tracing::debug!(%error, "failed to check if a blob has an event");
                                return ControlFlow::Continue(ERROR_RETRY);
                            },
                        };

                        if !has_event && let Err(error) = filestore.delete_blob(&digest).await {
                            tracing::warn!(%key, %error, "failed to delete unused blob");
                            deleted += 1;
                        }
                    }
                }

                if let Err(error) = Query::blob_prune_processed_prefix(&mut tx, &prefix).await {
                    tracing::warn!(%error, "failed to mark blob prefix as processed");
                    return ControlFlow::Continue(ERROR_RETRY);
                }
                if let Err(error) = tx.commit().await {
                    tracing::warn!(%error, "failed to commit marking blob prefix as processed");
                    return ControlFlow::Continue(ERROR_RETRY);
                }

                tracing::debug!(%prefix, processed, skipped, deleted, elapsed = ?start_prefix.elapsed(), "pruned blobs with prefix");
                last_prefix = Some(prefix);
                total_processed += processed;
                total_skipped += skipped;
                total_deleted += total_processed;
            }

            let next_check = match Query::blob_prune_least_recent_run(&mut conn).await {
                // If we have the same amount of processes as prefixes to check
                // we can get here while the prefixes are still being worked on
                // meaning `next` might be right now.
                Ok(Some(timestamp)) => {
                    let until_next = timestamp.signed_duration_since(Utc::now())
                        .to_std().unwrap_or(Duration::ZERO);
                    // To avoid a busy loop wait at least 1 hour before running again.
                    max(until_next, Duration::from_hours(1))
                },
                // Shouldn't happen unless the table is empty.
                Ok(None) => ERROR_RETRY,
                Err(error) => {
                    tracing::warn!(%error, "failed to get next blob prune time");
                    ERROR_RETRY
                },
            };

            tracing::info!(processed = total_processed, skipped = total_skipped, deleted = total_deleted, elapsed = ?start.elapsed(), "pruned blobs");
            ControlFlow::Continue(next_check)
        }
    });
}
