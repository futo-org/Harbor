//! Per-request access log, emitted as structured events on the `access`
//! target. `identity` comes from the auth middleware (response extensions),
//! so authenticated traffic can be attributed to users.

use std::sync::LazyLock;
use std::time::Instant;

use axum::extract::Request;
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use opentelemetry::KeyValue;
use opentelemetry::metrics::{Counter, Histogram};

use crate::service::auth::AuthenticatedIdentity;

static HTTP_REQUESTS: LazyLock<Counter<u64>> = LazyLock::new(|| {
    opentelemetry::global::meter("server")
        .u64_counter("http_server_requests")
        .build()
});

static HTTP_DURATION: LazyLock<Histogram<f64>> = LazyLock::new(|| {
    opentelemetry::global::meter("server")
        .f64_histogram("http_server_request_duration_seconds")
        .build()
});

/// Collapse parameterised paths so metric label cardinality stays bounded.
/// gRPC paths (`/pkg.Service/Method`) are already a fixed set.
fn route_of(path: &str) -> String {
    if path.starts_with("/blob/") {
        return "/blob/{digest_id}".to_string();
    }
    path.to_string()
}

pub async fn access_log_middleware(
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_owned();
    // Probe noise.
    if path == "/status" {
        return next.run(request).await;
    }

    let method = request.method().clone();
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let user_agent = header("user-agent");
    // First hop in x-forwarded-for is the client, set by the gateway.
    let client_ip = header("x-forwarded-for")
        .map(|v| v.split(',').next().unwrap_or_default().trim().to_owned());

    let start = Instant::now();
    let response = next.run(request).await;

    let identity = response
        .extensions()
        .get::<AuthenticatedIdentity>()
        .map(|i| i.0.clone());
    // Present on gRPC-Web trailers-only responses; full gRPC puts it in
    // trailers, which are not visible here.
    let grpc_status = response
        .headers()
        .get("grpc-status")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let attrs = [
        KeyValue::new("method", method.to_string()),
        KeyValue::new("route", route_of(&path)),
        KeyValue::new("status", response.status().as_u16() as i64),
    ];
    HTTP_REQUESTS.add(1, &attrs);
    HTTP_DURATION.record(start.elapsed().as_secs_f64(), &attrs);

    tracing::info!(
        target: "access",
        %method,
        path,
        status = response.status().as_u16(),
        grpc_status,
        latency_ms = start.elapsed().as_millis() as u64,
        identity,
        client_ip,
        user_agent,
        "request"
    );
    response
}
