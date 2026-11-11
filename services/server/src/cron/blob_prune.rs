//! Cron job that prunes unused blobs from the objects store.

use std::ops::ControlFlow;
use std::time::{Duration, Instant, SystemTime};

use polycentric_common::models::protos_v2::ContentDigest;
use sea_orm::DatabaseConnection;
use tokio_stream::StreamExt;

use crate::config;
use crate::cron::Cron;
use crate::db::DbConn;
use crate::service::content::content_filestore::{ContentFilestore, DateTime};
use crate::service::content::repository::Query;

pub(crate) fn run(
    cron: &Cron,
    db: DatabaseConnection,
    filestore: ContentFilestore,
) {
    let every = Duration::from_hours(1);
    cron.every(every, move || {
        let grace_period = config::get().blob_prune_grace;
        let minimum_age = DateTime::from(SystemTime::now() - grace_period);
        tracing::debug!(?grace_period, ?minimum_age, "pruning blob");
        let db = db.clone();
        let filestore = filestore.clone();
        async move {
            let start = Instant::now();
            let mut conn = match DbConn::from_pool(&db).await {
                Ok(conn) => conn,
                Err(error) => {
                    tracing::warn!(%error, "failed acquire database connection");
                    return ControlFlow::Continue(());
                },
            };
            drop(db); // Don't use the pool any more.

            let mut objects = filestore.list_objects();
            loop {
                let object = match objects.next().await {
                    Some(Ok(object)) => object,
                    Some(Err(error)) => {
                        tracing::warn!(%error, "failed to list objects");
                        return ControlFlow::Continue(());
                    },
                    None => break, // Processed all.
                };

                // Skip blob without a key (seems unlikely), that are too
                // recently modified (created) and don't have the expected key
                // format.
                let Some(key) = object.key else {
                    tracing::debug!("skipped object without key");
                    continue;
                };
                if let Some(last_modified) = object.last_modified && last_modified <= minimum_age {
                    tracing::debug!(%key, "skipped object that is too young");
                    continue;
                };
                let Some(digest) = ContentDigest::from_id(&key) else {
                    tracing::debug!(%key, "skipped object as it has the wrong key format");
                    continue;
                };

                let has_event = match Query::blob_has_event(&mut conn, digest.r#type, &digest.value).await {
                    Ok(has_event) => has_event,
                    Err(error) => {
                        tracing::debug!(%error, "failed to check if a blob has an event");
                        return ControlFlow::Continue(());
                    },
                };

                if !has_event {
                    if let Err(error) = filestore.delete_blob(&digest).await {
                        tracing::warn!(%key, %error, "failed to delete unused blob");
                    }
                }
            }

            tracing::info!(elapsed = ?start.elapsed(), "prune blobs");
            ControlFlow::Continue(())
        }
    });
}
