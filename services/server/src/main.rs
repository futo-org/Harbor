mod db;
mod grpc;
mod routes;
mod service;
mod util;

use crate::db::client::build_db_client;
use crate::grpc::server;
use crate::routes::build_routes;
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::server::server_service::ServerConfig;
use sea_orm::DatabaseConnection;
use std::path::PathBuf;

/// Connect to the database, retrying with backoff.
async fn connect_db_with_retry() -> DatabaseConnection {
    let mut delay = std::time::Duration::from_secs(1);
    loop {
        match build_db_client().await {
            Ok(db) => return db,
            Err(e) => {
                eprintln!(
                    "Failed to connect to database: {e}, retrying in {delay:?}"
                );
                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(std::time::Duration::from_secs(30));
            }
        }
    }
}

/// Resolve the directory where uploaded blobs are persisted. Override
/// with the `BLOBS_DIR` env var; defaults to `./data/blobs`.
fn blobs_dir() -> PathBuf {
    std::env::var("BLOBS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/blobs"))
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
    util::dotenv::load(".env");

    let db = connect_db_with_retry().await;
    let filestore = ContentFilestore::new(blobs_dir());
    let server_cfg = server_config();

    let grpc = {
        let db = db.clone();
        let filestore = filestore.clone();
        let server_cfg = server_cfg.clone();
        tokio::spawn(async move {
            if let Err(e) = server::serve_grpc(db, filestore, server_cfg).await
            {
                eprintln!("gRPC server error: {e}");
            }
        })
    };

    let routes = build_routes(db, filestore);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("HTTP server listening on http://0.0.0.0:3000");
    println!("API docs available at http://0.0.0.0:3000/docs");
    let http =
        tokio::spawn(async { axum::serve(listener, routes).await.unwrap() });

    tokio::try_join!(grpc, http).unwrap();
}
