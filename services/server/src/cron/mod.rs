//! Cron system.

use std::future::Future;
use std::ops::ControlFlow;
use std::time::Duration;

use sea_orm::sea_query::{Expr, PgFunc, SelectStatement};
use sea_orm::{DatabaseConnection, DbErr};
use tokio::time::{MissedTickBehavior, interval, sleep};
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use crate::db::{Connection, DbTx};
use crate::service::content::content_filestore::ContentFilestore;

mod blob_prune;
mod gravity;

/// Start all cron jobs.
pub(crate) fn start_jobs(
    db: DatabaseConnection,
    filestore: ContentFilestore,
) -> Cron {
    let cron = Cron {
        tasks: TaskTracker::new(),
        cancel: CancellationToken::new(),
    };

    gravity::update(&cron, db.clone());
    blob_prune::run(&cron, db.clone(), filestore);

    cron
}

/// Cron jobs.
pub(crate) struct Cron {
    tasks: TaskTracker,
    cancel: CancellationToken,
}

impl Cron {
    /// Cancel all jobs and wait for all jobs to stop.
    pub(crate) async fn wait(self) {
        self.tasks.close();
        self.cancel.cancel();
        self.tasks.wait().await;
    }

    /// Run `f` every `period` until it's canceled.
    fn every<F, Fut>(&self, period: Duration, mut f: F)
    where
        F: FnMut() -> Fut + Send + 'static,
        Fut: Future<Output = ControlFlow<()>> + Send + 'static,
    {
        let mut interval = interval(period);
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
        let cancel = self.cancel.clone();
        self.tasks
            .spawn(cancel.run_until_cancelled_owned(async move {
                loop {
                    interval.tick().await;
                    if let ControlFlow::Break(()) = f().await {
                        break;
                    }
                }
            }));
    }

    /// Run `f` then sleep for the returned duration and call `f` again.
    fn repeated<F, Fut>(&self, mut f: F)
    where
        F: FnMut() -> Fut + Send + 'static,
        Fut: Future<Output = ControlFlow<(), Duration>> + Send + 'static,
    {
        let cancel = self.cancel.clone();
        self.tasks
            .spawn(cancel.run_until_cancelled_owned(async move {
                loop {
                    let duration = match f().await {
                        ControlFlow::Continue(duration) => duration,
                        ControlFlow::Break(()) => break,
                    };
                    sleep(duration).await;
                }
            }));
    }
}

/// Postgres lock.
struct AdvisoryLock(i64);

const GRAVITY: i64 = 1 << 32;
const BLOB_PRUNE: i64 = 1 << 32;

impl AdvisoryLock {
    pub(crate) const fn gravity() -> AdvisoryLock {
        AdvisoryLock(GRAVITY)
    }

    pub(crate) fn blob_prune(prefix: &str) -> AdvisoryLock {
        let mut bytes = [0; 4];
        let len = prefix.len().min(bytes.len());
        bytes[..len].copy_from_slice(&prefix.as_bytes()[..len]);
        let key = i32::from_le_bytes(bytes) as i64;
        AdvisoryLock(BLOB_PRUNE | key)
    }

    /// Lock the key and run `f`.
    ///
    /// In production/staging we run multiple instances of the server
    /// simultaneously, this means the varios cron jobs are run concurrently.
    /// For some jobs that's fine, but for others it's a problem or even just
    /// wasteful.
    ///
    /// To prevent concurrent jobs doing the same things we use Postgres
    /// advisory locks. We lock a key, and as long as all keys are created using
    /// the same method, we can ensure that only a single job of the same kind
    /// runs concurrently.
    ///
    /// However if other code, not this cron system, starts using advisory locks
    /// we might have an issue with two unrelated components using the same
    /// locks.
    ///
    /// We could use row level locking as well, but then we lock all out all
    /// other users of the rows, which is not ideal for rows that are accessed a
    /// lot (especially if it's not needed).
    pub(crate) async fn try_lock(
        self,
        tx: &mut DbTx<'_>,
    ) -> Result<bool, DbErr> {
        let mut query = SelectStatement::new();
        query.expr(PgFunc::try_advisory_lock(Expr::Constant(self.0.into())));
        if tx
            .query_one(&query)
            .await?
            .map_or(Ok(false), |r| r.try_get_by(0))?
        {
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
