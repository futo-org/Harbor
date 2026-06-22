mod context;
mod db;
mod expo_client;
mod manager;
mod polycentric;
mod repository;
mod rpc;

use context::Context;
use manager::NotificationManager;
use polycentric::PolycentricClient;

use log::{info, warn};

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use common_kafka::{BorrowedMessage, CommitMode, Consumer, Headers, Message, Offset};
use polycentric_common::models::protos_v2::Notification;
use prost::Message as _;
use tonic::transport::Server;

/// Duration before retrying a Retry event.
const RETRY_BACKOFF: Duration = Duration::from_secs(2);

/// Number of times a message is retried before it is skipped (committed
/// past without being processed).
const MAX_RETRIES: u32 = 5;

/// Whether the consumed message's offset should be committed.
enum Outcome {
    /// Done with this message — commit so it is not redelivered.
    Commit,
    /// Transient failure — seek back so the message is re-delivered and
    /// retried (see the consume loop). After [`MAX_RETRIES`] it is skipped.
    Retry,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env before anything reads the environment.
    common_dotenv::load(".env");

    // Initialize the log backend. Defaults to `info` so output appears
    // without RUST_LOG set; override with e.g. RUST_LOG=debug.
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // Shared connection, then run migrations on every load.
    let db = db::connect().await?;
    db::run_migrations(&db).await?;

    // Treat a blank EXPO_ACCESS_TOKEN as unset — sending an empty bearer
    // token makes Expo reject the request with 401, whereas sending no auth
    // header is accepted for projects without enhanced push security.
    let expo_access_token = std::env::var("EXPO_ACCESS_TOKEN")
        .ok()
        .filter(|t| !t.is_empty());
    let notification_manager = NotificationManager::new(expo_access_token);

    let polycentric = PolycentricClient::from_env()?;

    // The server events must originate from for this service to fire
    // notifications.
    let main_server = std::env::var("POLYCENTRIC_MAIN_SERVER")
        .map_err(|_| "POLYCENTRIC_MAIN_SERVER is not set".to_string())?;

    let ctx = Arc::new(Context {
        db,
        notification_manager,
        polycentric,
        main_server,
    });

    // Address the gRPC `NotificationService` (push-token register/unregister)
    // listens on.
    let grpc_addr: SocketAddr = std::env::var("POLYCENTRIC_NOTIFICATIONS_GRPC_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3001".to_string())
        .parse()?;

    // Serve gRPC and consume Kafka concurrently. If either future returns,
    // the process exits (and is restarted by the supervisor).
    tokio::select! {
        result = serve_grpc(ctx.clone(), grpc_addr) => {
            if let Err(e) = result {
                warn!("gRPC server exited: {}", e);
            }
        }
        _ = run_consumer(ctx) => {}
    }

    Ok(())
}

/// Serve the gRPC `NotificationService` (push-token register/unregister).
async fn serve_grpc(ctx: Arc<Context>, addr: SocketAddr) -> Result<(), tonic::transport::Error> {
    info!("NotificationService gRPC listening on {addr}");
    Server::builder()
        .add_service(rpc::build_notification_service(ctx))
        .serve(addr)
        .await
}

/// Consume the `notifications` Kafka topic and drive push processing.
async fn run_consumer(ctx: Arc<Context>) {
    // Listen to the materialized notifications produced by the server.
    let consumer = common_kafka::build_consumer("push-notifications", &["notifications"]).await;

    // Failure counts for messages currently being retried.
    let mut attempts: HashMap<(i32, i64), u32> = HashMap::new();

    loop {
        let message = match consumer.recv().await {
            Ok(message) => message,
            Err(e) => {
                warn!("Kafka error: {}", e);
                continue;
            }
        };

        let coord = (message.partition(), message.offset());

        match process(&ctx, &message).await {
            Outcome::Commit => {
                attempts.remove(&coord);
                if let Err(e) = consumer.commit_message(&message, CommitMode::Async) {
                    warn!("failed to commit offset: {}", e);
                }
            }
            Outcome::Retry => {
                let failures = {
                    let count = attempts.entry(coord).or_insert(0);
                    *count += 1;
                    *count
                };

                if failures > MAX_RETRIES {
                    // Retries exhausted — give up and commit past this message
                    // so the partition can make progress.
                    warn!(
                        "message at partition {} offset {} failed {} times; skipping",
                        coord.0, coord.1, failures
                    );
                    attempts.remove(&coord);
                    if let Err(e) = consumer.commit_message(&message, CommitMode::Async) {
                        warn!("failed to commit offset after skip: {}", e);
                    }
                } else {
                    // Seek back so the next poll re-delivers this message, then
                    // back off to avoid a hot loop.
                    if let Err(e) = consumer.seek(
                        message.topic(),
                        message.partition(),
                        Offset::Offset(message.offset()),
                        Duration::from_secs(5),
                    ) {
                        warn!("failed to seek for retry: {}", e);
                    }
                    tokio::time::sleep(RETRY_BACKOFF).await;
                }
            }
        }
    }
}

/// Handle a single consumed message.
async fn process(ctx: &Context, message: &BorrowedMessage<'_>) -> Outcome {
    // Only notifications published by the main server should fire pushes.
    // Skip (commit past) anything from another source.
    let source_server = message
        .headers()
        .and_then(|headers| headers.iter().find(|h| h.key == "SOURCE_SERVER"))
        .and_then(|header| header.value);
    if source_server != Some(ctx.main_server.as_bytes()) {
        return Outcome::Commit;
    }

    let notification = match message.payload() {
        Some(bytes) => match Notification::decode(bytes) {
            Ok(n) => n,
            Err(e) => {
                warn!("failed to decode Notification: {:?}", e);
                return Outcome::Commit;
            }
        },
        None => return Outcome::Commit,
    };

    // The triggering event drives the push — its content determines the
    // reply/follow message. A notification without one is a no-op.
    let Some(trigger) = notification.trigger_event else {
        return Outcome::Commit;
    };

    match ctx.notification_manager.process_event(ctx, &trigger).await {
        Ok(_) => Outcome::Commit,
        Err(e) => {
            warn!("Push notification processing error: {}", e);
            Outcome::Retry
        }
    }
}
