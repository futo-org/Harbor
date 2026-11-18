//! Cron job that prunes unused blobs from the objects store.

use std::cmp::{max, min};
use std::ops::ControlFlow;
use std::time::{Duration, Instant, SystemTime};

use chrono::Utc;
use sea_orm::DatabaseConnection;

use crate::config;
use crate::cron::{AdvisoryLock, Cron};
use crate::db::{Connection, DbConn};
use crate::service::content::content_filestore::{ContentFilestore, DateTime};
use crate::service::content::repository::{Mutation, Query};

/// Duration between two checks.
const TIME_BETWEEN_CHECKS: Duration = Duration::from_hours(6);

/// Duration before we try again on error.
const ERROR_RETRY: Duration = Duration::from_hours(1);

pub(crate) fn start(
    cron: &Cron,
    db: DatabaseConnection,
    filestore: ContentFilestore,
) {
    cron.repeated(move || {
        let db = db.clone();
        let filestore = filestore.clone();
        async move {
            let mut db = match DbConn::from_pool(&db).await {
                Ok(conn) => { drop(db); conn},
                Err(error) => {
                    tracing::warn!(%error, "failed acquire database connection for pruning blobs");
                    return ControlFlow::Continue(ERROR_RETRY);
                },
            };

            let grace_period = config::get().blob_prune_grace;
            let dry_run = config::get().blob_prune_dry_run;
            let next_run = run(&mut db, &filestore, grace_period, dry_run).await
                .unwrap_or(ERROR_RETRY);
            ControlFlow::Continue(next_run)
        }
    });
}

/// Prune blobs.
pub(crate) async fn run(
    db: &mut DbConn,
    filestore: &ContentFilestore,
    grace_period: Duration,
    dry_run: bool,
) -> Result<Duration, ()> {
    let start = Instant::now();
    let minimum_age = DateTime::from(SystemTime::now() - grace_period);
    tracing::debug!(?grace_period, ?minimum_age, %dry_run, "pruning blobs");

    let mut processed = 0;
    let mut deleted = 0;
    let mut failed = 0;

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(error) => {
            tracing::warn!(%error, "failed to start transaction for pruning blobs");
            return Err(());
        }
    };

    match AdvisoryLock::blob_prune().try_lock(&mut tx).await {
        Ok(true) => {}
        Ok(false) => {
            tracing::debug!("prune blob prefix lock is locked, skipping");
            if let Err(error) = tx.rollback().await {
                tracing::warn!(%error, "failed to abort transaction for pruning blobs");
            }
            let next_check = next_run(db).await;
            return Ok(next_check);
        }
        Err(error) => {
            tracing::warn!(%error, "failed acquire blob prune lock");
            if let Err(error) = tx.rollback().await {
                tracing::warn!(%error, "failed to abort transaction for pruning blobs");
            }
            return Err(());
        }
    };

    let unused_blobs = match Query::list_unused_blobs(&mut tx, grace_period)
        .await
    {
        Ok(unused_blobs) => unused_blobs,
        Err(error) => {
            tracing::warn!(%error, "failed list unused blobs");
            if let Err(error) = tx.rollback().await {
                tracing::warn!(%error, "failed to abort transaction for pruning blobs");
            }
            return Err(());
        }
    };

    let mut delete_from_index = Vec::with_capacity(unused_blobs.len());
    for (key, digest) in unused_blobs {
        tracing::info!(%key, "pruning unused blob");

        processed += 1;
        if !dry_run && let Err(error) = filestore.delete_blob(&digest).await {
            tracing::warn!(%key, %error, "failed to delete unused blob");
            failed += 1;
        } else {
            deleted += 1;
            delete_from_index.push(key)
        }
    }

    let next_run = next_run(&mut tx).await;

    if !delete_from_index.is_empty() {
        if !dry_run
            && let Err(error) =
                Mutation::remove_blobs_from_index(&mut tx, delete_from_index)
                    .await
        {
            tracing::warn!(%error, "failed remove unused blobs from database (already removed from content storage)");
            if let Err(error) = tx.rollback().await {
                tracing::warn!(%error, "failed to abort transaction for pruning blobs");
            }
            return Err(());
        }

        if let Err(error) = tx.commit().await {
            tracing::warn!(%error, "failed to commit transaction for pruning blobs");
            return Err(());
        }
    } else {
        if let Err(error) = tx.rollback().await {
            tracing::warn!(%error, "failed to rollback transaction for pruning blobs");
            return Err(());
        }
    }

    let elapsed = start.elapsed();
    tracing::info!(
        processed,
        deleted,
        failed,
        ?elapsed,
        ?next_run,
        "pruned blobs"
    );
    Ok(next_run)
}

/// Return the duration until when this job should run next.
async fn next_run<C: Connection>(db: &mut C) -> Duration {
    match Query::blob_recent_modified(db).await {
        Ok(Some(timestamp)) => {
            let until_next = (timestamp + config::get().blob_prune_grace)
                .signed_duration_since(Utc::now())
                .to_std()
                .unwrap_or(Duration::ZERO);
            // To avoid a busy loop wait at least 1 hour before running again.
            max(until_next, Duration::from_hours(1))
        }
        // Only happens if the table is empty.
        Ok(None) => min(config::get().blob_prune_grace, TIME_BETWEEN_CHECKS),
        Err(error) => {
            tracing::warn!(%error, "failed to get next blob prune time");
            ERROR_RETRY
        }
    }
}
