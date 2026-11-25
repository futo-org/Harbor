//! Cron system.

use std::future::Future;
use std::ops::ControlFlow;
use std::time::Duration;

use sea_orm::DatabaseConnection;
use tokio::time::{MissedTickBehavior, interval, sleep};
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use crate::service::content::content_filestore::ContentFilestore;

pub(crate) mod blob_index;
pub(crate) mod blob_prune;
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
    blob_prune::start(&cron, db, filestore);

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
