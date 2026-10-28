use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Extension, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::routing::{get, post};
use axum::{Router, middleware};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::auth::{AuthenticatedIdentity, auth_middleware};
use crate::config::Config;
use crate::forward::{forward, stamp};
use crate::identity::PolycentricIdentities;

pub const LOGS_PATH: &str = "/insert/opentelemetry/v1/logs";
pub const TRACES_PATH: &str = "/insert/opentelemetry/v1/traces";

#[derive(Clone)]
pub struct AppState {
    pub config: &'static Config,
    pub http: reqwest::Client,
    pub identities: Arc<PolycentricIdentities>,
}

pub fn build_routes(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::any())
        .allow_methods([Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .max_age(std::time::Duration::from_secs(86400));

    let ingest = Router::new()
        .route("/v1/logs", post(post_logs))
        .route("/v1/traces", post(post_traces))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(DefaultBodyLimit::max(state.config.max_body_bytes));

    Router::new()
        .route("/status", get(|| async { "OK." }))
        .merge(ingest)
        .with_state(state)
        .layer(cors)
}

async fn post_logs(
    State(state): State<AppState>,
    Extension(identity): Extension<AuthenticatedIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(base) = state.config.victoria_logs_url.as_deref() else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    ingest(
        &state,
        &identity,
        &headers,
        body,
        "resourceLogs",
        &format!("{base}{LOGS_PATH}"),
    )
    .await
}

async fn post_traces(
    State(state): State<AppState>,
    Extension(identity): Extension<AuthenticatedIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(base) = state.config.victoria_traces_url.as_deref() else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    ingest(
        &state,
        &identity,
        &headers,
        body,
        "resourceSpans",
        &format!("{base}{TRACES_PATH}"),
    )
    .await
}

async fn ingest(
    state: &AppState,
    identity: &AuthenticatedIdentity,
    headers: &HeaderMap,
    body: Bytes,
    resource_key: &str,
    url: &str,
) -> StatusCode {
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("application/json"));
    if !is_json {
        return StatusCode::UNSUPPORTED_MEDIA_TYPE;
    }
    let mut payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(payload) => payload,
        Err(_) => return StatusCode::BAD_REQUEST,
    };
    stamp(&mut payload, resource_key, identity);
    forward(&state.http, url, &payload).await
}
