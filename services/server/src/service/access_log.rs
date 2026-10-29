//! Per-request access log, emitted as structured events on the `access`
//! target. `identity` comes from the auth middleware (response extensions),
//! so authenticated traffic can be attributed to users. `trace_id` comes from
//! the client's `traceparent` header.

use std::sync::LazyLock;
use std::time::Instant;

use axum::extract::Request;
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use opentelemetry::KeyValue;
use opentelemetry::metrics::{Counter, Histogram};
use tracing::Instrument;

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

/// Trace id of a well formed W3C `traceparent`.
pub fn trace_id_of(traceparent: &str) -> Option<&str> {
    let mut parts = traceparent.trim().split('-');
    let version = parts.next()?;
    let trace_id = parts.next()?;
    let span_id = parts.next()?;
    let flags = parts.next()?;
    let hex = |s: &str, len: usize| {
        s.len() == len
            && s.bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    };
    let valid = parts.next().is_none()
        && hex(version, 2)
        && version != "ff"
        && hex(trace_id, 32)
        && trace_id.bytes().any(|b| b != b'0')
        && hex(span_id, 16)
        && span_id.bytes().any(|b| b != b'0')
        && hex(flags, 2);
    valid.then_some(trace_id)
}

pub async fn access_log_middleware(
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_owned();
    // Probe noise: health checks and CI's deploy polling.
    if path == "/status" || path == "/version" {
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
    let trace_id = header("traceparent")
        .as_deref()
        .and_then(trace_id_of)
        .map(str::to_owned);

    let start = Instant::now();
    let response = match &trace_id {
        Some(trace_id) => {
            next.run(request)
                .instrument(tracing::info_span!("request", trace_id))
                .await
        }
        None => next.run(request).await,
    };

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
        trace_id,
        "request"
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_trace_id_of_a_traceparent() {
        assert_eq!(
            trace_id_of(
                "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
            ),
            Some("0af7651916cd43dd8448eb211c80319c")
        );
        assert_eq!(
            trace_id_of(
                " 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00 "
            ),
            Some("0af7651916cd43dd8448eb211c80319c")
        );
    }

    #[test]
    fn ignores_malformed_traceparents() {
        for bad in [
            "",
            "garbage",
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331",
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01-extra",
            "ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
            "00-00000000000000000000000000000000-b7ad6b7169203331-01",
            "00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01",
            "00-0AF7651916CD43DD8448EB211C80319C-b7ad6b7169203331-01",
            "00-0af7651916cd43dd8448eb211c8031-b7ad6b7169203331-01",
        ] {
            assert_eq!(trace_id_of(bad), None, "{bad}");
        }
    }
}
