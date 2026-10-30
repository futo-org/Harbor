//! Server span and access log for every request. The span is named after
//! the gRPC method or HTTP route, is a child of the client's `traceparent`
//! (whose sampled flag is ignored, see `common_telemetry::trace::layer`),
//! and its trace id is on every log line emitted while handling the
//! request. `identity` comes from the auth middleware (response
//! extensions), so authenticated traffic can be attributed to users.

use std::sync::LazyLock;
use std::time::Instant;

use axum::body::Body;
use axum::extract::Request;
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use http_body_util::BodyExt;
use opentelemetry::KeyValue;
use opentelemetry::metrics::{Counter, Histogram};
use tracing::Instrument;
use tracing::field::Empty;

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

/// The service and method of a gRPC path, `/pkg.Service/Method`.
fn rpc_of(path: &str) -> Option<(&str, &str)> {
    let (service, method) = path.strip_prefix('/')?.split_once('/')?;
    (service.contains('.') && !method.is_empty() && !method.contains('/'))
        .then_some((service, method))
}

/// gRPC status codes a server reports as span errors; the rest are the
/// client's doing.
fn is_server_error(grpc_status: &str) -> bool {
    matches!(grpc_status, "2" | "4" | "12" | "13" | "14" | "15")
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
    let route = route_of(&path);

    let rpc = rpc_of(&path);
    let name = match rpc {
        Some((service, method)) => format!("{service}/{method}"),
        None => format!("{method} {route}"),
    };
    let span = tracing::info_span!(
        "request",
        otel.kind = "server",
        otel.name = name.as_str(),
        otel.status_code = Empty,
        rpc.system = rpc.map(|_| "grpc"),
        rpc.service = rpc.map(|(service, _)| service),
        rpc.method = rpc.map(|(_, method)| method),
        rpc.grpc.status_code = Empty,
        http.request.method = %method,
        http.route = route,
        url.path = path,
        http.response.status_code = Empty,
        client.address = client_ip,
        user_agent.original = user_agent,
        harbor.identity = Empty,
        trace_id = Empty,
    );
    let parent = common_telemetry::trace::context_from_headers(&headers);
    let parent_trace_id = common_telemetry::trace::trace_id_of(&parent);
    common_telemetry::trace::set_parent(&span, parent);
    let trace_id = common_telemetry::trace::trace_id(&span).or(parent_trace_id);
    span.record("trace_id", trace_id.as_deref());

    // The body span lives as long as the body is being read: how long the
    // server waited on the client for it.
    let body_span = tracing::info_span!(parent: &span, "request.body");
    let request = request.map(|body| {
        Body::new(body.map_frame(move |frame| {
            let _reading = &body_span;
            frame
        }))
    });

    let start = Instant::now();
    let response = next.run(request).instrument(span.clone()).await;

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
    let status = response.status().as_u16();

    span.record("harbor.identity", identity.as_deref());
    span.record("http.response.status_code", status);
    span.record("rpc.grpc.status_code", grpc_status.as_deref());
    if status >= 500 || grpc_status.as_deref().is_some_and(is_server_error) {
        span.record("otel.status_code", "ERROR");
    }

    let attrs = [
        KeyValue::new("method", method.to_string()),
        KeyValue::new("route", route),
        KeyValue::new("status", status as i64),
    ];
    HTTP_REQUESTS.add(1, &attrs);
    HTTP_DURATION.record(start.elapsed().as_secs_f64(), &attrs);

    tracing::info!(
        target: "access",
        %method,
        path,
        status,
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
    use axum::Router;
    use axum::body::{Body, Bytes, to_bytes};
    use axum::routing::post;
    use opentelemetry::trace::{SpanKind, Status};
    use tower::ServiceExt;

    use super::*;

    const TRACEPARENT: &str =
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

    fn app() -> Router {
        Router::new()
            .route(
                "/polycentric.v2.EventsService/PutEvents",
                post(|| async {
                    common_telemetry::trace::trace_id(&tracing::Span::current())
                        .unwrap_or_default()
                }),
            )
            .layer(axum::middleware::from_fn(access_log_middleware))
    }

    async fn call(path: &str, traceparent: Option<&str>) -> String {
        let mut request = Request::builder().method("POST").uri(path);
        if let Some(traceparent) = traceparent {
            request = request.header("traceparent", traceparent);
        }
        let response = app()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        String::from_utf8(body.to_vec()).unwrap()
    }

    #[tokio::test]
    async fn the_request_span_continues_the_clients_trace() {
        let (subscriber, exporter) = common_telemetry::testing::subscriber();
        let _guard = tracing::subscriber::set_default(subscriber);

        let seen_by_handler =
            call("/polycentric.v2.EventsService/PutEvents", Some(TRACEPARENT))
                .await;

        let spans = exporter.get_finished_spans().unwrap();
        let span = spans
            .iter()
            .find(|s| s.name == "polycentric.v2.EventsService/PutEvents")
            .expect("server span");
        assert_eq!(
            span.span_context.trace_id().to_string(),
            "0af7651916cd43dd8448eb211c80319c"
        );
        assert_eq!(span.parent_span_id.to_string(), "b7ad6b7169203331");
        assert_eq!(span.span_kind, SpanKind::Server);
        assert_eq!(seen_by_handler, "0af7651916cd43dd8448eb211c80319c");
        let attribute = |key: &str| {
            span.attributes
                .iter()
                .find(|kv| kv.key.as_str() == key)
                .map(|kv| kv.value.to_string())
        };
        assert_eq!(attribute("rpc.method").as_deref(), Some("PutEvents"));
        assert_eq!(
            attribute("trace_id").as_deref(),
            Some("0af7651916cd43dd8448eb211c80319c")
        );
        assert_eq!(span.status, Status::Unset);
    }

    #[tokio::test]
    async fn the_clients_sampled_flag_cannot_switch_tracing_off() {
        let (subscriber, exporter) = common_telemetry::testing::subscriber();
        let _guard = tracing::subscriber::set_default(subscriber);

        let unsampled = TRACEPARENT.replace("-01", "-00");
        call("/polycentric.v2.EventsService/PutEvents", Some(&unsampled)).await;

        let spans = exporter.get_finished_spans().unwrap();
        let span = spans
            .iter()
            .find(|s| s.name == "polycentric.v2.EventsService/PutEvents")
            .expect("server span");
        assert!(span.span_context.is_sampled());
    }

    #[tokio::test]
    async fn the_body_span_ends_when_the_body_has_arrived() {
        use tokio_stream::StreamExt;

        let (subscriber, exporter) = common_telemetry::testing::subscriber();
        let _guard = tracing::subscriber::set_default(subscriber);

        let delay = std::time::Duration::from_millis(50);
        let chunk = Ok::<_, axum::Error>(Bytes::from_static(b"hi"));
        let body = Body::from_stream(tokio_stream::iter([chunk]).then(
            move |chunk| async move {
                tokio::time::sleep(delay).await;
                chunk
            },
        ));
        let app = Router::new()
            .route("/upload", post(|_: Bytes| async {}))
            .layer(axum::middleware::from_fn(access_log_middleware));
        let request = Request::post("/upload").body(body).unwrap();
        app.oneshot(request).await.unwrap();

        let spans = exporter.get_finished_spans().unwrap();
        let find = |name| spans.iter().find(|s| s.name == name).unwrap();
        let (server, body) = (find("POST /upload"), find("request.body"));
        assert_eq!(body.parent_span_id, server.span_context.span_id());
        assert!(
            body.end_time.duration_since(body.start_time).unwrap() >= delay
        );
    }

    #[test]
    fn splits_grpc_paths_into_service_and_method() {
        assert_eq!(
            rpc_of("/polycentric.v2.EventsService/PutEvents"),
            Some(("polycentric.v2.EventsService", "PutEvents"))
        );
        assert_eq!(rpc_of("/blob/1_abc"), None);
        assert_eq!(rpc_of("/"), None);
        assert_eq!(rpc_of("/polycentric.v2.EventsService/"), None);
    }
}
