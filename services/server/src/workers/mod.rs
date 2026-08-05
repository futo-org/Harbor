//! Workers are run by `server workers [name…]` — all of them, or only the
//! named ones.
//!
//! Every worker declared its own Kafka consumer group.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use common_kafka::{
    BorrowedMessage, CommitMode, Consumer, Message, Offset, build_consumer,
};
use tokio::task::JoinSet;

use crate::service::context::ServiceContext;
use crate::service::notifications::worker::NotificationWorker;
use crate::service::stats::worker::StatsWorker;

/// A fatal error that ends a worker (and, with it, the `workers` process).
pub type WorkerError = Box<dyn std::error::Error + Send + Sync>;

/// Messages handled per consumer group, by outcome
/// (committed / retried / skipped).
static WORKER_MESSAGES: std::sync::LazyLock<
    opentelemetry::metrics::Counter<u64>,
> = std::sync::LazyLock::new(|| {
    opentelemetry::global::meter("server")
        .u64_counter("worker_messages")
        .build()
});

fn count_message(group_id: &str, outcome: &'static str) {
    WORKER_MESSAGES.add(
        1,
        &[
            opentelemetry::KeyValue::new("group", group_id.to_string()),
            opentelemetry::KeyValue::new("outcome", outcome),
        ],
    );
}

/// Exit with an error if any name is not a registered worker. Called before
/// any connection is made, so typos fail fast.
pub fn validate_worker_names(only: &[String]) {
    let known = ["all", NotificationWorker::NAME, StatsWorker::NAME];
    for name in only {
        if !known.contains(&name.as_str()) {
            // Startup CLI misuse — plain stderr, logging may not matter yet.
            eprintln!(
                "unknown worker: {name} (known workers: {})",
                known.join(", ")
            );
            std::process::exit(2);
        }
    }
}

/// Backoff before a `Retry` message is re-delivered.
const RETRY_BACKOFF: Duration = Duration::from_secs(2);

/// Number of times a message is retried before it is skipped (committed
/// past without being processed) so the partition can make progress.
const MAX_RETRIES: u32 = 5;

/// Whether the consumed message's offset should be committed.
pub enum Outcome {
    /// Done with this message — commit so it is not redelivered.
    Commit,
    /// Transient failure — re-deliver and retry. Skipped after
    /// [`MAX_RETRIES`]. Not yet returned by any worker (materialization is
    /// pending), but part of the harness contract.
    #[allow(dead_code)]
    Retry,
}

/// Processes a single Kafka message. Implemented by each worker; the
/// handler owns whatever state (DB, producer, …) it needs.
#[tonic::async_trait]
pub trait MessageHandler: Send + Sync {
    async fn handle(&self, message: &BorrowedMessage<'_>) -> Outcome;
}

/// Spawn the registered workers (all, or only those named in `only`) and run
/// until one of them stops. Workers loop forever, so any return is unexpected
/// and fatal: we log it and let the process exit so the supervisor restarts
/// it (matching the API server).
pub async fn run_all_workers(ctx: Arc<ServiceContext>, only: Vec<String>) {
    let should_run = |name: &str| {
        only.is_empty() || only.iter().any(|n| n == "all" || n == name)
    };

    let mut set: JoinSet<(&'static str, Result<(), WorkerError>)> =
        JoinSet::new();

    // Define the workers
    if should_run(NotificationWorker::NAME) {
        let ctx = ctx.clone();
        set.spawn(async move {
            (
                NotificationWorker::NAME,
                NotificationWorker::new(ctx).run().await,
            )
        });
    }
    if should_run(StatsWorker::NAME) {
        let ctx = ctx.clone();
        set.spawn(async move {
            (StatsWorker::NAME, StatsWorker::new(ctx).run().await)
        });
    }

    tracing::info!(count = set.len(), "workers started");

    match set.join_next().await {
        Some(Ok((name, Ok(())))) => {
            tracing::error!(worker = name, "worker exited unexpectedly");
        }
        Some(Ok((name, Err(e)))) => {
            tracing::error!(worker = name, error = %e, "worker failed");
        }
        Some(Err(e)) => tracing::error!(error = %e, "a worker task panicked"),
        None => tracing::error!("no workers registered"),
    }

    set.shutdown().await;
}

/// Subscribe `group_id` to `topics` and run the consume/commit/retry loop,
/// dispatching every message to `handler`. Loops forever; only returns on a
/// fatal setup error.
pub async fn run_consumer(
    group_id: &str,
    topics: &[&str],
    handler: impl MessageHandler,
) -> Result<(), WorkerError> {
    let consumer = build_consumer(group_id, topics).await;

    // Failure counts for messages currently being retried.
    let mut attempts: HashMap<(i32, i64), u32> = HashMap::new();

    loop {
        let message = match consumer.recv().await {
            Ok(message) => message,
            Err(e) => {
                tracing::warn!(group_id, error = %e, "kafka error");
                continue;
            }
        };

        let coord = (message.partition(), message.offset());

        match handler.handle(&message).await {
            Outcome::Commit => {
                attempts.remove(&coord);
                count_message(group_id, "committed");
                if let Err(e) =
                    consumer.commit_message(&message, CommitMode::Async)
                {
                    tracing::warn!(group_id, error = %e, "failed to commit offset");
                }
            }
            Outcome::Retry => match record_failure(&mut attempts, coord) {
                RetryAction::Skip => {
                    count_message(group_id, "skipped");
                    tracing::error!(
                        group_id,
                        partition = coord.0,
                        offset = coord.1,
                        max_retries = MAX_RETRIES,
                        "message exceeded retries; skipping"
                    );
                    if let Err(e) =
                        consumer.commit_message(&message, CommitMode::Async)
                    {
                        tracing::warn!(
                            group_id,
                            error = %e,
                            "failed to commit offset after skip"
                        );
                    }
                }
                RetryAction::Backoff => {
                    count_message(group_id, "retried");
                    // Seek back so the next poll re-delivers this message,
                    // then back off to avoid a hot loop.
                    if let Err(e) = consumer.seek(
                        message.topic(),
                        message.partition(),
                        Offset::Offset(message.offset()),
                        Duration::from_secs(5),
                    ) {
                        tracing::warn!(group_id, error = %e, "failed to seek for retry");
                    }
                    tokio::time::sleep(RETRY_BACKOFF).await;
                }
            },
        }
    }
}

/// What to do with a message after a failed processing attempt.
#[derive(Debug, PartialEq, Eq)]
enum RetryAction {
    /// Re-deliver and retry after a backoff.
    Backoff,
    /// Retries exhausted — skip (commit past) so the partition progresses.
    Skip,
}

/// Record one more failed attempt for `coord`. Returns [`RetryAction::Skip`]
/// once attempts exceed [`MAX_RETRIES`] (and forgets `coord` so a later
/// redelivery starts a fresh count), otherwise [`RetryAction::Backoff`].
fn record_failure(
    attempts: &mut HashMap<(i32, i64), u32>,
    coord: (i32, i64),
) -> RetryAction {
    let count = attempts.entry(coord).or_insert(0);
    *count += 1;
    if *count > MAX_RETRIES {
        attempts.remove(&coord);
        RetryAction::Skip
    } else {
        RetryAction::Backoff
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_failure_backs_off_until_max_then_skips() {
        let mut attempts = HashMap::new();
        let coord = (0, 0);
        // The first MAX_RETRIES failures back off and are re-delivered.
        for _ in 0..MAX_RETRIES {
            assert_eq!(
                record_failure(&mut attempts, coord),
                RetryAction::Backoff
            );
        }
        // The next failure exceeds the limit and is skipped.
        assert_eq!(record_failure(&mut attempts, coord), RetryAction::Skip);
    }

    #[test]
    fn record_failure_forgets_coord_after_skip() {
        let mut attempts = HashMap::new();
        let coord = (1, 2);
        for _ in 0..=MAX_RETRIES {
            record_failure(&mut attempts, coord);
        }
        // The skip cleared the entry, so a redelivery starts fresh.
        assert!(!attempts.contains_key(&coord));
        assert_eq!(record_failure(&mut attempts, coord), RetryAction::Backoff);
    }

    #[test]
    fn record_failure_tracks_coords_independently() {
        let mut attempts = HashMap::new();
        let a = (0, 10);
        let b = (1, 20);
        for _ in 0..MAX_RETRIES {
            record_failure(&mut attempts, a);
        }
        // `b` is tracked separately and still backs off.
        assert_eq!(record_failure(&mut attempts, b), RetryAction::Backoff);
        // `a` exceeds the limit on its next failure.
        assert_eq!(record_failure(&mut attempts, a), RetryAction::Skip);
    }
}
