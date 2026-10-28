use std::sync::{Arc, LazyLock};
use std::time::Instant;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Extension, Request, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Router, middleware};
use opentelemetry::KeyValue;
use opentelemetry::metrics::{Counter, Histogram};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::auth::{AuthenticatedIdentity, auth_middleware};
use crate::config::Config;
use crate::forward::{forward, stamp};
use crate::identity::PolycentricIdentities;
use crate::spans::spans_to_logs;

pub const LOGS_PATH: &str = "/insert/opentelemetry/v1/logs";

/// Resource attributes VictoriaLogs indexes as stream fields. Everything
/// else on the resource, the per-user identity above all, stays a plain
/// field so there is one stream per app build and platform, not per user.
const LOG_STREAM_FIELDS: &str = "service.name,service.version,deployment.environment.name,os.name";

static HTTP_REQUESTS: LazyLock<Counter<u64>> = LazyLock::new(|| {
    opentelemetry::global::meter("otlp")
        .u64_counter("http_server_requests")
        .build()
});

static HTTP_DURATION: LazyLock<Histogram<f64>> = LazyLock::new(|| {
    opentelemetry::global::meter("otlp")
        .f64_histogram("http_server_request_duration_seconds")
        .build()
});

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
        .layer(middleware::from_fn(request_metrics))
}

async fn request_metrics(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    if path == "/status" {
        return next.run(request).await;
    }
    let method = request.method().clone();
    let start = Instant::now();
    let response = next.run(request).await;
    let attrs = [
        KeyValue::new("method", method.to_string()),
        KeyValue::new("route", path),
        KeyValue::new("status", i64::from(response.status().as_u16())),
    ];
    HTTP_REQUESTS.add(1, &attrs);
    HTTP_DURATION.record(start.elapsed().as_secs_f64(), &attrs);
    response
}

async fn post_logs(
    State(state): State<AppState>,
    Extension(identity): Extension<AuthenticatedIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    match parse(&headers, &body, "resourceLogs", &identity) {
        Ok(payload) => forward_logs(&state, &payload).await,
        Err(status) => status,
    }
}

/// Spans are stored as log records: VictoriaLogs is the only store.
async fn post_traces(
    State(state): State<AppState>,
    Extension(identity): Extension<AuthenticatedIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    match parse(&headers, &body, "resourceSpans", &identity) {
        Ok(payload) => forward_logs(&state, &spans_to_logs(&payload)).await,
        Err(status) => status,
    }
}

fn parse(
    headers: &HeaderMap,
    body: &Bytes,
    resource_key: &str,
    identity: &AuthenticatedIdentity,
) -> Result<serde_json::Value, StatusCode> {
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("application/json"));
    if !is_json {
        return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
    let mut payload: serde_json::Value =
        serde_json::from_slice(body).map_err(|_| StatusCode::BAD_REQUEST)?;
    stamp(&mut payload, resource_key, identity);
    Ok(payload)
}

async fn forward_logs(state: &AppState, payload: &serde_json::Value) -> StatusCode {
    let Some(base) = state.config.victoria_logs_url.as_deref() else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    forward(
        &state.http,
        &format!("{base}{LOGS_PATH}"),
        payload,
        &[("VL-Stream-Fields", LOG_STREAM_FIELDS)],
    )
    .await
}
