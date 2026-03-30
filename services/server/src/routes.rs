use axum::{Router, routing::get};

use crate::grpc::reflection_ui::reflection_ui;

/// Routes defined here for the polycentric server
pub fn build_routes() -> Router {
    Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/status", get(|| async { "OK." }))
        .route("/docs", get(reflection_ui))
}
