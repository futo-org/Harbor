//! A request's `traceparent` becomes the parent of the server's span, which
//! is exported over OTLP together with its children. The server must be
//! started with `HARBOR_TRACES_URL` pointing at this test's receiver, see
//! `.forgejo/scripts/integration-server.sh`.

use crate::*;
use axum::Router;
use axum::body::Bytes;
use axum::routing::post;
use opentelemetry_proto::tonic::collector::trace::v1::{
    ExportTraceServiceRequest, ExportTraceServiceResponse,
};
use opentelemetry_proto::tonic::common::v1::any_value::Value;
use opentelemetry_proto::tonic::trace::v1::Span;
use opentelemetry_proto::tonic::trace::v1::span::SpanKind;
use prost::Message;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const TRACE_TIMEOUT: Duration = Duration::from_secs(30);
const SERVER_SPAN: &str = "polycentric.v2.EventSyncService/PutEvents";

/// Port the OTLP/HTTP receiver listens on. Override with
/// `HARBOR_TEST_TRACES_PORT`.
fn traces_port() -> u16 {
    std::env::var("HARBOR_TEST_TRACES_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4318)
}

/// Spans received so far, each with its resource's `service.name`.
#[derive(Clone, Default)]
struct Received(Arc<Mutex<Vec<(Option<String>, Span)>>>);

impl Received {
    fn in_trace(&self, trace_id: &[u8]) -> Vec<(Option<String>, Span)> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, span)| span.trace_id == trace_id)
            .cloned()
            .collect()
    }
}

async fn serve_receiver(received: Received) {
    let app = Router::new().route(
        "/v1/traces",
        post(move |body: Bytes| {
            let received = received.clone();
            async move {
                let request = ExportTraceServiceRequest::decode(body)
                    .expect("invalid OTLP trace request");
                let mut spans = received.0.lock().unwrap();
                for resource in request.resource_spans {
                    let service = resource
                        .resource
                        .as_ref()
                        .and_then(|r| {
                            r.attributes
                                .iter()
                                .find(|a| a.key == "service.name")
                        })
                        .and_then(|a| a.value.as_ref()?.value.as_ref())
                        .and_then(|v| match v {
                            Value::StringValue(s) => Some(s.clone()),
                            _ => None,
                        });
                    for scope in resource.scope_spans {
                        for span in scope.spans {
                            spans.push((service.clone(), span));
                        }
                    }
                }
                (
                    [("content-type", "application/x-protobuf")],
                    ExportTraceServiceResponse::default().encode_to_vec(),
                )
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", traces_port()))
        .await
        .expect("failed to bind the traces receiver");
    axum::serve(listener, app).await.unwrap();
}

fn attribute<'a>(span: &'a Span, key: &str) -> Option<&'a Value> {
    span.attributes
        .iter()
        .find(|a| a.key == key)?
        .value
        .as_ref()?
        .value
        .as_ref()
}

/// Whether `span` is `ancestor` or below it, following parent ids.
fn descends_from(
    span: &Span,
    ancestor: &Span,
    spans: &[(Option<String>, Span)],
) -> bool {
    let by_id: HashMap<&[u8], &Span> = spans
        .iter()
        .map(|(_, s)| (s.span_id.as_slice(), s))
        .collect();
    let mut current = span;
    loop {
        if current.span_id == ancestor.span_id {
            return true;
        }
        match by_id.get(current.parent_span_id.as_slice()) {
            Some(parent) => current = parent,
            None => return false,
        }
    }
}

#[tokio::test]
async fn a_request_trace_is_exported_with_its_children() {
    let received = Received::default();
    tokio::spawn(serve_receiver(received.clone()));

    let mut client = TestClient::new().await;
    client.submit_events().await;
    client.post_text("traced", current_timestamp());
    let event_bundles = client.take_pending_events();

    let mut ids = [0u8; 24];
    getrandom::fill(&mut ids).unwrap();
    let (trace_id, client_span_id) = ids.split_at(16);
    let traceparent = format!(
        "00-{}-{}-01",
        hex::encode(trace_id),
        hex::encode(client_span_id)
    );
    let mut request = tonic::Request::new(PutEventsRequest { event_bundles });
    request
        .metadata_mut()
        .insert("traceparent", traceparent.parse().unwrap());
    let response = client
        .event_sync_client()
        .put_events(request)
        .await
        .expect("put_events failed")
        .into_inner();
    assert!(response.errors.is_empty(), "response: {response:?}");

    let wanted = [SERVER_SPAN, "add_event", "kafka.publish"];
    let deadline = Instant::now() + TRACE_TIMEOUT;
    let spans = loop {
        let spans = received.in_trace(trace_id);
        let has = |name: &str| spans.iter().any(|(_, s)| s.name == name);
        if wanted.iter().all(|name| has(name)) || Instant::now() > deadline {
            break spans;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    };
    let names: Vec<&str> = spans.iter().map(|(_, s)| s.name.as_str()).collect();

    let (service, server) = spans
        .iter()
        .find(|(_, s)| s.name == SERVER_SPAN)
        .unwrap_or_else(|| panic!("no server span in {names:?}"));
    assert_eq!(service.as_deref(), Some("server"));
    assert_eq!(server.kind, SpanKind::Server as i32);
    assert_eq!(server.parent_span_id, client_span_id);
    assert_eq!(
        attribute(server, "rpc.method"),
        Some(&Value::StringValue("PutEvents".to_string()))
    );
    assert_eq!(
        attribute(server, "trace_id"),
        Some(&Value::StringValue(hex::encode(trace_id)))
    );

    for name in ["add_event", "kafka.publish"] {
        let (_, span) = spans
            .iter()
            .find(|(_, s)| s.name == name)
            .unwrap_or_else(|| panic!("no {name} span in {names:?}"));
        assert!(
            descends_from(span, server, &spans),
            "{name} is not under the server span"
        );
    }
    let (_, publish) = spans
        .iter()
        .find(|(_, s)| s.name == "kafka.publish")
        .unwrap();
    assert_eq!(publish.kind, SpanKind::Producer as i32);
}
