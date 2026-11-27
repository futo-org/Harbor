//! Cron system.

use std::future::Future;
use std::ops::ControlFlow;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;
use std::time::Duration;

use sea_orm::sea_query::{Expr, PgFunc, SelectStatement};
use sea_orm::{DatabaseConnection, DbErr};
use tokio::time::{MissedTickBehavior, interval, sleep};
use tokio_util::either::Either;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use crate::db::{Connection, DbConn, DbTx};
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::proofs::cache::ProofCache;

pub(crate) mod blob_index;
pub(crate) mod blob_prune;
mod gravity;
pub(crate) mod identity_prune;

/// Start all cron jobs.
pub(crate) fn start_jobs(
    db: DatabaseConnection,
    filestore: ContentFilestore,
    proof_cache: Arc<ProofCache>,
) -> Cron {
    let cron = Cron::new();
    gravity::update(&cron, db.clone());
    blob_prune::start(&cron, db.clone(), filestore.clone());
    identity_prune::start(&cron, db, filestore, proof_cache);
    cron
}

/// Cron jobs.
#[derive(Clone)]
pub(crate) struct Cron {
    tasks: TaskTracker,
    cancel: CancellationToken,
}

impl Cron {
    pub(crate) fn new() -> Cron {
        Cron {
            tasks: TaskTracker::new(),
            cancel: CancellationToken::new(),
        }
    }

    /// Cancel all jobs and wait for all jobs to stop.
    pub(crate) async fn cancel_and_wait(self) {
        self.cancel.cancel();
        self.close_and_wait().await;
    }

    /// Close the cron job for new jobs and wait for all existing jobs to stop.
    pub(crate) async fn close_and_wait(self) {
        self.tasks.close();
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
        self.spawn(async move {
            loop {
                interval.tick().await;
                if let ControlFlow::Break(()) = f().await {
                    break;
                }
            }
        });
    }

    /// Run `f` then sleep for the returned duration and call `f` again.
    fn repeated<F, Fut>(&self, mut f: F)
    where
        F: FnMut() -> Fut + Send + 'static,
        Fut: Future<Output = ControlFlow<(), Duration>> + Send + 'static,
    {
        self.spawn(async move {
            loop {
                let duration = match f().await {
                    ControlFlow::Continue(duration) => duration,
                    ControlFlow::Break(()) => break,
                };
                sleep(duration).await;
            }
        });
    }

    /// Spawn a future.
    ///
    /// Uses the task tracer and supports cancelation.
    fn spawn<Fut>(&self, fut: Fut)
    where
        Fut: Future<Output = ()> + Send + 'static,
    {
        let cancel = self.cancel.clone();
        self.tasks.spawn(cancel.run_until_cancelled_owned(fut));
    }
}

/// Postgres lock.
struct AdvisoryLock(i64);

const GRAVITY: i64 = 1;
const BLOB_PRUNE: i64 = 2;
const IDENTITY_PRUNE: i64 = 3;

impl AdvisoryLock {
    pub(crate) const fn gravity() -> AdvisoryLock {
        AdvisoryLock(GRAVITY)
    }

    pub(crate) fn blob_prune() -> AdvisoryLock {
        AdvisoryLock(BLOB_PRUNE)
    }

    pub(crate) fn identity_prune(identity: &str) -> AdvisoryLock {
        let mut key_bytes = IDENTITY_PRUNE.to_be_bytes();
        let mut indices = (0..4).into_iter().cycle();
        for b in identity.as_bytes() {
            let idx = indices.next().unwrap_or(0);
            key_bytes[idx] ^= b;
        }
        AdvisoryLock(i64::from_be_bytes(key_bytes))
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
        query.expr(PgFunc::try_advisory_xact_lock(Expr::Constant(
            self.0.into(),
        )));
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

    /// Similar to [`AdvisoryLock::try_lock`], but doesn't lock for just the
    /// transaction, but the entire session of the connection (i.e. locks while
    /// it's alive).
    ///
    /// Return value:
    ///  * `Ok(GuardConn)` -> acquired the lock.
    ///  * `Ok(DbConn)` -> failed to acquire lock (not an error).
    ///  * `Err((DbConn, DbErr))` -> locking failed.
    #[allow(clippy::result_large_err)]
    pub(crate) async fn try_session_lock(
        self,
        db: DbConn,
    ) -> Result<Either<GuardConn, DbConn>, (DbConn, DbErr)> {
        let mut query = SelectStatement::new();
        let key = self.0;
        query.expr(PgFunc::try_advisory_lock(Expr::Constant(key.into())));
        let locked = match db.query_one(&query).await {
            Ok(Some(row)) => match row.try_get_by(0) {
                Ok(Some(locked)) => locked,
                Ok(None) => false,
                Err(err) => return Err((db, err)),
            },
            Ok(None) => false,
            Err(err) => return Err((db, err)),
        };
        if locked {
            Ok(Either::Left(GuardConn { db: Some(db), key }))
        } else {
            Ok(Either::Right(db))
        }
    }
}

/// Connection that guards a session lock.
#[must_use]
struct GuardConn {
    db: Option<DbConn>,
    key: i64,
}

impl GuardConn {
    /// Unlock the advisory session lock, returning the underlying connection.
    pub(crate) async fn unlock(mut self) -> Result<DbConn, DbErr> {
        let mut db = self.db.take().unwrap();
        match session_unlock(&mut db, self.key).await {
            Ok(()) => Ok(db),
            Err(err) => {
                if let Err(error) = db.close().await {
                    tracing::warn!(%error, "failed to close connection after failing to unlock session lock");
                }
                Err(err)
            }
        }
    }
}

impl Deref for GuardConn {
    type Target = DbConn;

    fn deref(&self) -> &Self::Target {
        self.db.as_ref().unwrap()
    }
}

impl DerefMut for GuardConn {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.db.as_mut().unwrap()
    }
}

impl Drop for GuardConn {
    fn drop(&mut self) {
        let Some(mut db) = self.db.take() else {
            return;
        };
        let key = self.key;
        tokio::spawn(async move {
            match session_unlock(&mut db, key).await {
                Ok(()) => db.return_to_pool().await,
                Err(error) => {
                    tracing::warn!(%error, "failed to unlock session lock");
                    if let Err(error) = db.close().await {
                        tracing::warn!(%error, "failed to close connection after failing to unlock session lock");
                    }
                }
            }
        });
    }
}

async fn session_unlock(db: &mut DbConn, key: i64) -> Result<(), DbErr> {
    let mut query = SelectStatement::new();
    query.expr(PgFunc::advisory_unlock(Expr::Constant(key.into())));
    let unlocked = db
        .query_one(&query)
        .await?
        .map_or(Ok(false), |r| r.try_get_by(0))?;
    if unlocked {
        Ok(())
    } else {
        Err(DbErr::Custom(format!(
            "failed to unlock advisory lock '{key}', lock not held",
        )))
    }
}
