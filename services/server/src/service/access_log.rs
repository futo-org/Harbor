//! Per-request access log, emitted as structured events on the `access`
//! target. `identity` comes from the auth middleware (response extensions),
//! so authenticated traffic can be attributed to users.

use std::time::Instant;

use axum::extract::Request;
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;

use crate::service::auth::AuthenticatedIdentity;

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
