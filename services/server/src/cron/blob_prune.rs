//! Cron job that prunes unused blobs from the objects store.

use std::ops::ControlFlow;
use std::time::{Duration, Instant};

use sea_orm::DatabaseConnection;

use crate::config;
use crate::cron::Cron;
use crate::db::{Connection, DbConn};
use crate::service::content::content_filestore::ContentFilestore;

pub(crate) fn run(
    cron: &Cron,
    db: DatabaseConnection,
    filestore: ContentFilestore,
) {
    let every = Duration::from_hours(1);
    cron.every(every, move || {
        let grace_period = config::get().blob_prune_grace;
        tracing::debug!(?grace_period, "pruning blob");
        let db = db.clone();
        async move {
            let start = Instant::now();
            let mut conn = match DbConn::from_pool(&db).await {
                Ok(conn) => conn,
                Err(err) => {
                    tracing::warn!(error = %err, "failed acquire database connection");
                    return ControlFlow::Continue(());
                },
            };
            drop(db); // Don't use the pool any more.

            // TODO: do the actual pruning.

            tracing::info!(elapsed = ?start.elapsed(), "prune blobs");
            ControlFlow::Continue(())
        }
    });
}
