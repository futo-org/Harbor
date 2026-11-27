//! Job that prunes all data for a deleted identity.

use std::ops::ControlFlow;
use std::sync::Arc;
use std::time::{Duration, Instant};

use sea_orm::DatabaseConnection;
use tokio::sync::Semaphore;
use tokio_util::either::Either;

use crate::ContentFilestore;
use crate::config;
use crate::cron::{AdvisoryLock, Cron};
use crate::db::DbConn;
use crate::service::identity::repository;
use crate::service::identity::service::{PerformedBy, erase_identity};
use crate::service::proofs::cache::ProofCache;

/// Default duration between two checks if any identities need pruning.
const DEFAULT_TIME_BETWEEN_CHECKS: Duration = Duration::from_hours(6);

/// Maximum number of concurrent identity pruning tasks.
const MAX_CONCURRENCY: usize = 10;

pub(crate) fn start(
    cron: &Cron,
    db: DatabaseConnection,
    filestore: ContentFilestore,
    proof_cache: Arc<ProofCache>,
) {
    let c = cron.clone();
    cron.repeated(move || {
        let cron = c.clone();
        let db = db.clone();
        let filestore = filestore.clone();
        let proof_cache = proof_cache.clone();
        async move {
            let grace_period = config::get().identity_prune_grace;
            run(
                &cron,
                db,
                filestore,
                proof_cache,
                grace_period,
                MAX_CONCURRENCY,
                true, /* Dry run. */
            )
            .await;
            ControlFlow::Continue(DEFAULT_TIME_BETWEEN_CHECKS)
        }
    });
}

pub(crate) async fn run(
    cron: &Cron,
    mut db: DatabaseConnection,
    filestore: ContentFilestore,
    proof_cache: Arc<ProofCache>,
    grace_period: Duration,
    max_concurrency: usize,
    dry_run: bool,
) {
    let identities =
        repository::Query::identities_to_be_pruned(&mut db, grace_period)
            .await
            .unwrap();

    let concurrency = Arc::new(Semaphore::new(max_concurrency));
    for identity in identities {
        cron.spawn(prune_identity(
            concurrency.clone(),
            db.clone(),
            filestore.clone(),
            proof_cache.clone(),
            identity,
            dry_run,
        ));
    }
}

async fn prune_identity(
    concurrency: Arc<Semaphore>,
    db: DatabaseConnection,
    filestore: ContentFilestore,
    proof_cache: Arc<ProofCache>,
    identity: String,
    dry_run: bool,
) {
    let start = Instant::now();
    // Get a permit before we start to limit the amount of database connections
    // used.
    let _permit = concurrency.acquire().await.unwrap();

    tracing::debug!(%identity, permit_acquire_duration = ?start.elapsed(), "pruning identity");
    let start = Instant::now();
    let db = match DbConn::from_pool(&db).await {
        Ok(db) => db,
        Err(error) => {
            tracing::warn!(%error, %identity, "failed acquire database connection for pruning identity");
            return;
        }
    };

    let mut db = match AdvisoryLock::identity_prune(&identity)
        .try_session_lock(db)
        .await
    {
        Ok(Either::Left(db)) => db,
        Ok(Either::Right(db)) => {
            drop(db);
            tracing::debug!(
                identity,
                "identity prune lock is locked for identity, skipping"
            );
            return;
        }
        Err((db, error)) => {
            drop(db);
            tracing::debug!(%error, identity, "failed to acquire identity prune lock");
            return;
        }
    };

    let result = erase_identity(
        &mut db,
        Some(&filestore),
        Some(&*proof_cache),
        &identity,
        PerformedBy::System,
        dry_run,
    )
    .await;
    let erased = match result {
        Ok(erased) => erased,
        Err(error) => {
            tracing::warn!(%error, %identity, "failed prune identity");
            return;
        }
    };

    if let Err(error) = db.unlock().await {
        tracing::warn!(%error, %identity, "failed to unlock prune identity lock");
        // NOTE: continue to log below.
    }
    let elapsed = start.elapsed();
    tracing::info!(%identity, num_events = %erased.events, num_content = %erased.content, num_blobs = %erased.blobs, ?elapsed, "pruned identity");
}
