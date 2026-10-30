//! A request's `traceparent` becomes the parent of the server's span, which
//! is exported over OTLP together with its children. The server must be
//! started with `HARBOR_TRACES_URL` pointing at the suite's receiver
//! (traces_receiver.rs), see `.forgejo/scripts/integration-server.sh`.

use crate::*;
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use opentelemetry_proto::tonic::common::v1::any_value::Value;
use opentelemetry_proto::tonic::trace::v1::Span;
use opentelemetry_proto::tonic::trace::v1::span::SpanKind;
use prost::Message;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const TRACE_TIMEOUT: Duration = Duration::from_secs(30);
const SERVER_SPAN: &str = "polycentric.v2.EventSyncService/PutEvents";

/// Where the receiver answers. Override with `HARBOR_TEST_TRACES_URL`.
fn traces_url() -> String {
    std::env::var("HARBOR_TEST_TRACES_URL")
        .unwrap_or_else(|_| "http://localhost:4318".to_string())
}

/// Every span the receiver has, each with its resource's `service.name`.
async fn received() -> Vec<(Option<String>, Span)> {
    let body = reqwest::get(format!("{}/v1/traces", traces_url()))
        .await
        .expect("traces receiver unreachable")
        .bytes()
        .await
        .unwrap();
    let request = ExportTraceServiceRequest::decode(body)
        .expect("invalid OTLP trace request");
    let mut spans = Vec::new();
    for resource in request.resource_spans {
        let service = resource
            .resource
            .as_ref()
            .and_then(|r| r.attributes.iter().find(|a| a.key == "service.name"))
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
    spans
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
    let mut client = TestClient::new().await;
    client.submit_events().await;
    client.post_text("traced", current_timestamp());
    let event_bundles = client.take_pending_events();

    let mut ids = [0u8; 24];
    getrandom::fill(&mut ids).unwrap();
    let (client_trace_id, client_span_id) = ids.split_at(16);
    let traceparent = format!(
        "00-{}-{}-01",
        hex::encode(client_trace_id),
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
        let spans: Vec<(Option<String>, Span)> = received()
            .await
            .into_iter()
            .filter(|(_, s)| s.trace_id == client_trace_id)
            .collect();
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
        Some(&Value::StringValue(hex::encode(client_trace_id)))
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
