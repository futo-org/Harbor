mod config;
mod data;
mod db;
mod grpc;
mod routes;
mod service;
mod util;
mod workers;

use crate::db::client::build_db_client;
use crate::grpc::server::build_grpc_router;
use crate::routes::build_routes;
use crate::service::content::content_filestore::{
    ContentFilestore, ContentFilestoreConfig,
};
use crate::service::context::ServiceContext;
use crate::service::server::rpc::ServerConfig;
use common_kafka::build_producer;
use sea_orm::DatabaseConnection;

/// Connect to the database, retrying with backoff.
async fn connect_db_with_retry() -> DatabaseConnection {
    let mut delay = std::time::Duration::from_secs(1);
    loop {
        match build_db_client().await {
            Ok(db) => return db,
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    ?delay,
                    "failed to connect to database, retrying"
                );
                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(std::time::Duration::from_secs(30));
            }
        }
    }
}

/// Build the server config served by `ServerService.GetInfo`. Version
/// comes from the crate's `Cargo.toml`; `CDN_URL` overrides the public
/// URL clients use to fetch blob bodies.
fn server_config() -> ServerConfig {
    ServerConfig {
        version: env!("CARGO_PKG_VERSION").to_string(),
        cdn_url: std::env::var("CDN_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string()),
    }
}

#[tokio::main]
async fn main() {
    common_dotenv::load(".env");
    common_telemetry::init();

    // `server`                  -> run the API (gRPC + HTTP) server (default)
    // `server workers [name…]`  -> run the named workers (`all` or no
    //                              names = every worker)
    match std::env::args().nth(1).as_deref() {
        None | Some("serve") => run_server().await,
        Some("workers") => {
            run_workers(std::env::args().skip(2).collect()).await
        }
        Some(other) => {
            // Startup CLI misuse — plain stderr, logging may not matter yet.
            eprintln!(
                "unknown subcommand: {other}\nusage: server [serve|workers [name…]]"
            );
            std::process::exit(2);
        }
    }
}

/// Run the API server: gRPC + HTTP merged onto a single port.
async fn run_server() {
    common_telemetry::init_metrics("server");
    let db = connect_db_with_retry().await;
    let kafka_producer = build_producer()
        .await
        .expect("failed to build Kafka producer");
    let filestore_cfg = ContentFilestoreConfig::from_env()
        .expect("blob store configuration error");
    let filestore = ContentFilestore::new(filestore_cfg).await;
    let server_cfg = server_config();

    let grpc_router = build_grpc_router(
        db.clone(),
        kafka_producer,
        filestore.clone(),
        server_cfg,
    )
    .expect("failed to build gRPC router");
    let http_router = build_routes(db, filestore);

    let app = http_router
        .merge(grpc_router)
        .layer(axum::middleware::from_fn(
            crate::service::access_log::access_log_middleware,
        ));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    tracing::info!(addr = "0.0.0.0:3000", "server listening");
    axum::serve(listener, app).await.unwrap();
}

/// Run background workers concurrently in one process — all of them, or
/// only the ones named in `only`.
async fn run_workers(only: Vec<String>) {
    workers::validate_worker_names(&only);
    common_telemetry::init_metrics("server-workers");
    let db = connect_db_with_retry().await;
    let kafka_producer = build_producer()
        .await
        .expect("failed to build Kafka producer");
    let ctx = ServiceContext::new(db, kafka_producer);

    workers::run_all_workers(ctx, only).await;
}
