//! Cron system.

use std::future::Future;
use std::ops::ControlFlow;
use std::time::Duration;

use sea_orm::DatabaseConnection;
use tokio::time::{MissedTickBehavior, interval};
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

mod gravity;

/// Start all cron jobs.
pub(crate) fn start_jobs(db: DatabaseConnection) -> Cron {
    let cron = Cron {
        tasks: TaskTracker::new(),
        cancel: CancellationToken::new(),
    };

    gravity::start(&cron, db.clone());

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
}
