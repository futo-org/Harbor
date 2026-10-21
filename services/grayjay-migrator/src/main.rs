//! The long-running lookup service: `GET /identity/{legacy_system_key}` returns
//! the v2 identity the migrator created for a legacy system key (hex).

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use grayjay_migrator::{config, db, mapping};
use sea_orm::DatabaseConnection;
use serde::Serialize;
use tracing::{error, info};

struct AppState {
    db: DatabaseConnection,
}

#[derive(Serialize)]
struct IdentityResponse {
    legacy_system_key: String,
    identity: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    common_dotenv::load(".env");
    config::init()?;

    common_telemetry::init();
    common_telemetry::init_metrics("grayjay-migrator");

    let db = db::connect().await?;
    db::run_migrations(&db).await?;

    let state = Arc::new(AppState { db });
    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/identity/{legacy_system_key}", get(lookup_identity))
        .with_state(state);

    let addr = &config::get().http_addr;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("grayjay-migrator lookup service listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

/// Resolve a legacy system key (hex) to its migrated v2 identity.
async fn lookup_identity(
    State(state): State<Arc<AppState>>,
    Path(legacy_system_key): Path<String>,
) -> Result<Json<IdentityResponse>, StatusCode> {
    let key = legacy_system_key.trim().to_lowercase();
    match mapping::identity_for_legacy_key(&state.db, &key).await {
        Ok(Some(identity)) => Ok(Json(IdentityResponse {
            legacy_system_key: key,
            identity,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            error!("identity lookup failed: {e}");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
