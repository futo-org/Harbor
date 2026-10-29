//! The otlp service end to end: real JWTs, identity documents fetched from a
//! polycentric server over gRPC, and payloads forwarded to a Victoria
//! stand-in.

mod support;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ed25519_dalek::SigningKey;
use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use opentelemetry_proto::tonic::common::v1::KeyValue;
use otlp_service::forward::{ATTR_IDENTITY, ATTR_SIGNING_KEY, string_value};
use otlp_service::records::ATTR_SPAN_NAME;
use otlp_service::routes::{LOGS_PATH, TRACES_PATH};
use prost::Message;
use serde_json::json;
use support::{Otlp, PolycentricStandIn, device_key, identity_for, mint, now};

const JSON: &str = "application/json";
const STREAM_FIELDS: &str = "service.name,service.version,deployment.environment.name,os.name";

fn spans() -> String {
    json!({ "resourceSpans": [{
        "resource": { "attributes": [
            { "key": "service.name", "value": { "stringValue": "harbor" } },
            { "key": ATTR_IDENTITY, "value": { "stringValue": "spoofed" } }
        ]},
        "scopeSpans": [{ "spans": [{
            "traceId": "0af7651916cd43dd8448eb211c80319c",
            "spanId": "b7ad6b7169203331",
            "name": "app.feedback",
            "endTimeUnixNano": "1700000000000000000",
            "attributes": [
                { "key": "harbor.feedback.message", "value": { "stringValue": "love it" } }
            ],
            "events": [{ "name": "log", "timeUnixNano": "1699999999000000000", "attributes": [
                { "key": "log.severity", "value": { "stringValue": "warn" } },
                { "key": "log.message", "value": { "stringValue": "slow feed" } }
            ]}]
        }]}]
    }]})
    .to_string()
}

fn logs() -> String {
    json!({ "resourceLogs": [{ "scopeLogs": [] }] }).to_string()
}

/// What the stamp puts on every resource.
fn stamped_identity() -> Vec<(String, String)> {
    let (identity, _) = identity_for(&device_key());
    vec![
        (ATTR_IDENTITY.to_string(), identity),
        (
            ATTR_SIGNING_KEY.to_string(),
            hex::encode(device_key().verifying_key().to_bytes()),
        ),
    ]
}

fn pairs(attributes: &[KeyValue]) -> Vec<(String, String)> {
    attributes
        .iter()
        .map(|attribute| {
            (
                attribute.key.clone(),
                string_value(attributes, &attribute.key)
                    .unwrap_or_default()
                    .to_string(),
            )
        })
        .collect()
}

type Captured<T> = Arc<Mutex<Option<T>>>;

/// A Victoria mock on `path` that accepts protobuf and keeps the decoded
/// request for the test.
async fn capturing_mock<T: Message + Default + Send + 'static>(
    victoria: &mut mockito::ServerGuard,
    path: &str,
) -> (mockito::Mock, Captured<T>) {
    let captured: Captured<T> = Arc::default();
    let slot = captured.clone();
    let mock = victoria
        .mock("POST", path)
        .match_header("content-type", "application/x-protobuf")
        .match_request(move |request| {
            let body = request.body().unwrap();
            *slot.lock().unwrap() = Some(T::decode(body.as_slice()).unwrap());
            true
        })
        .create_async()
        .await;
    (mock, captured)
}

async fn otlp_with_victoria() -> (Otlp, mockito::ServerGuard) {
    let victoria = mockito::Server::new_async().await;
    let (polycentric, _server) = PolycentricStandIn::default()
        .with(&device_key())
        .serve()
        .await;
    let otlp = Otlp::serve(&polycentric, Some(&victoria.url())).await;
    (otlp, victoria)
}

#[tokio::test]
async fn a_paired_device_gets_its_traces_to_victoria_stamped() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    let (mock, captured) =
        capturing_mock::<ExportTraceServiceRequest>(&mut victoria, TRACES_PATH).await;

    let token = otlp.token(&device_key());
    let response = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;

    assert_eq!(response.status(), 200);
    mock.assert_async().await;
    let traces = captured.lock().unwrap().take().unwrap();
    let resource = &traces.resource_spans[0];
    let mut expected = vec![("service.name".to_string(), "harbor".to_string())];
    expected.extend(stamped_identity());
    assert_eq!(
        pairs(&resource.resource.as_ref().unwrap().attributes),
        expected
    );

    let span = &resource.scope_spans[0].spans[0];
    assert_eq!(span.name, "app.feedback");
    assert_eq!(
        hex::encode(&span.trace_id),
        "0af7651916cd43dd8448eb211c80319c"
    );
    assert_eq!(hex::encode(&span.span_id), "b7ad6b7169203331");
    assert_eq!(span.end_time_unix_nano, 1_700_000_000_000_000_000);
    assert_eq!(
        string_value(&span.attributes, "harbor.feedback.message"),
        Some("love it")
    );
    assert_eq!(span.events[0].name, "log");
    assert_eq!(
        string_value(&span.events[0].attributes, "log.message"),
        Some("slow feed")
    );
}

#[tokio::test]
async fn logs_reach_victoria_logs_with_stream_fields() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    let (mock, captured) =
        capturing_mock::<ExportLogsServiceRequest>(&mut victoria, LOGS_PATH).await;
    let mock = mock.match_header("VL-Stream-Fields", STREAM_FIELDS);

    let token = otlp.token(&device_key());
    let response = otlp.post("/v1/logs", Some(&token), JSON, logs()).await;

    assert_eq!(response.status(), 200);
    mock.assert_async().await;
    let logs = captured.lock().unwrap().take().unwrap();
    let resource = logs.resource_logs[0].resource.as_ref().unwrap();
    assert_eq!(pairs(&resource.attributes), stamped_identity());
}

#[tokio::test]
async fn requests_without_a_token_are_unauthorized() {
    let (otlp, _victoria) = otlp_with_victoria().await;
    let response = otlp.post("/v1/traces", None, JSON, spans()).await;
    assert_eq!(response.status(), 401);
}

#[tokio::test]
async fn tampered_expired_and_misaddressed_tokens_are_unauthorized() {
    let (otlp, _victoria) = otlp_with_victoria().await;
    let (iss, _) = identity_for(&device_key());
    let expired = mint(&device_key(), &iss, &otlp.url, now() - 1);
    let elsewhere = mint(&device_key(), &iss, "https://other.service", now() + 60);
    let tampered = format!("{}x", otlp.token(&device_key()));

    for token in [expired, elsewhere, tampered, "garbage".to_string()] {
        let response = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;
        assert_eq!(response.status(), 401, "{token}");
    }
}

#[tokio::test]
async fn an_unpaired_device_is_forbidden_before_victoria_sees_anything() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    let untouched = victoria
        .mock("POST", TRACES_PATH)
        .expect(0)
        .create_async()
        .await;
    let (iss, _) = identity_for(&device_key());
    let stranger = SigningKey::from_bytes(&[1u8; 32]);

    let response = otlp
        .post(
            "/v1/traces",
            Some(&mint(&stranger, &iss, &otlp.url, now() + 60)),
            JSON,
            spans(),
        )
        .await;

    assert_eq!(response.status(), 403);
    untouched.assert_async().await;
}

#[tokio::test]
async fn an_identity_the_server_does_not_know_is_forbidden() {
    let (otlp, _victoria) = otlp_with_victoria().await;
    let unknown = SigningKey::from_bytes(&[2u8; 32]);
    let response = otlp
        .post("/v1/traces", Some(&otlp.token(&unknown)), JSON, spans())
        .await;
    assert_eq!(response.status(), 403);
}

#[tokio::test]
async fn an_unreachable_polycentric_server_is_unavailable() {
    let victoria = mockito::Server::new_async().await;
    let otlp = Otlp::serve("http://127.0.0.1:1", Some(&victoria.url())).await;
    let response = otlp
        .post(
            "/v1/traces",
            Some(&otlp.token(&device_key())),
            JSON,
            spans(),
        )
        .await;
    assert_eq!(response.status(), 503);
}

#[tokio::test]
async fn identity_documents_are_cached() {
    let mut victoria = mockito::Server::new_async().await;
    let (polycentric, outage) = PolycentricStandIn::default()
        .with(&device_key())
        .serve()
        .await;
    let otlp = Otlp::serve(&polycentric, Some(&victoria.url())).await;
    let token = otlp.token(&device_key());
    let forwarded = victoria
        .mock("POST", TRACES_PATH)
        .expect(2)
        .create_async()
        .await;

    let first = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;
    assert_eq!(first.status(), 200);

    // With the server failing, only the cached document can answer this one.
    outage.begin();
    let second = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;
    assert_eq!(second.status(), 200);
    forwarded.assert_async().await;

    // A device the cache has never seen still needs the server.
    let newcomer = SigningKey::from_bytes(&[3u8; 32]);
    let response = otlp
        .post("/v1/traces", Some(&otlp.token(&newcomer)), JSON, spans())
        .await;
    assert_eq!(response.status(), 503);
}

#[tokio::test]
async fn a_signal_without_an_upstream_is_unavailable() {
    let (polycentric, _server) = PolycentricStandIn::default()
        .with(&device_key())
        .serve()
        .await;
    let otlp = Otlp::serve(&polycentric, None).await;
    let token = otlp.token(&device_key());
    for (path, body) in [("/v1/traces", spans()), ("/v1/logs", logs())] {
        let response = otlp.post(path, Some(&token), JSON, body).await;
        assert_eq!(response.status(), 503, "{path}");
    }
}

#[tokio::test]
async fn a_failing_victoria_is_a_bad_gateway() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    victoria
        .mock("POST", TRACES_PATH)
        .with_status(500)
        .create_async()
        .await;
    let response = otlp
        .post(
            "/v1/traces",
            Some(&otlp.token(&device_key())),
            JSON,
            spans(),
        )
        .await;
    assert_eq!(response.status(), 502);
}

#[tokio::test]
async fn only_json_bodies_are_accepted() {
    let (otlp, _victoria) = otlp_with_victoria().await;
    let token = otlp.token(&device_key());

    let protobuf = otlp
        .post(
            "/v1/traces",
            Some(&token),
            "application/x-protobuf",
            "x".into(),
        )
        .await;
    assert_eq!(protobuf.status(), 415);

    let malformed = otlp
        .post("/v1/traces", Some(&token), JSON, "{".into())
        .await;
    assert_eq!(malformed.status(), 400);

    let big = format!(
        r#"{{"resourceSpans":[],"pad":"{}"}}"#,
        "x".repeat(16 * 1024)
    );
    let too_big = otlp.post("/v1/traces", Some(&token), JSON, big).await;
    assert_eq!(too_big.status(), 413);
}

#[tokio::test]
async fn status_and_preflight_need_no_token() {
    let (otlp, _victoria) = otlp_with_victoria().await;

    let status = otlp
        .client
        .get(format!("{}/status", otlp.url))
        .send()
        .await
        .unwrap();
    assert_eq!(status.status(), 200);

    let preflight = otlp
        .client
        .request(reqwest::Method::OPTIONS, format!("{}/v1/traces", otlp.url))
        .header("origin", "https://harbor.social")
        .header("access-control-request-method", "POST")
        .header(
            "access-control-request-headers",
            "authorization,content-type",
        )
        .send()
        .await
        .unwrap();
    assert!(preflight.status().is_success());
    let allowed = preflight
        .headers()
        .get("access-control-allow-headers")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    assert!(allowed.contains("authorization"), "{allowed}");
}

#[tokio::test]
async fn feedback_is_relayed_to_zulip() {
    let mut victoria = mockito::Server::new_async().await;
    let stored = victoria.mock("POST", TRACES_PATH).create_async().await;
    let mut zulip = mockito::Server::new_async().await;
    let (polycentric, _server) = PolycentricStandIn::default()
        .with(&device_key())
        .serve()
        .await;
    let otlp = Otlp::serve_relaying(&polycentric, Some(&victoria.url()), Some(&zulip.url())).await;
    let (identity, _) = identity_for(&device_key());
    let relayed = zulip
        .mock("POST", "/api/v1/messages")
        .match_header("authorization", "Basic Ym90QGV4YW1wbGUuY29tOnNlY3JldA==")
        .match_body(mockito::Matcher::AllOf(vec![
            mockito::Matcher::Regex(
                "^type=stream&to=harbor-feedback&topic=love\\+it\\+%C2%B7\\+0af76519&content="
                    .to_string(),
            ),
            mockito::Matcher::Regex(format!("New\\+feedback.*%60{identity}%60")),
            mockito::Matcher::Regex("love\\+it".to_string()),
            mockito::Matcher::Regex("Logs\\+attached%3A\\+1".to_string()),
            mockito::Matcher::Regex("0af7651916cd43dd8448eb211c80319c".to_string()),
        ]))
        .create_async()
        .await;

    let token = otlp.token(&device_key());
    let response = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;
    assert_eq!(response.status(), 200);

    let deadline = Instant::now() + Duration::from_secs(5);
    while !relayed.matched_async().await && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    relayed.assert_async().await;
    stored.assert_async().await;
}

#[tokio::test]
async fn feedback_is_mirrored_to_victoria_logs_as_a_record() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    let stored = victoria.mock("POST", TRACES_PATH).create_async().await;
    let (mirror, captured) =
        capturing_mock::<ExportLogsServiceRequest>(&mut victoria, LOGS_PATH).await;
    let mirror = mirror.match_header("VL-Stream-Fields", STREAM_FIELDS);

    let token = otlp.token(&device_key());
    let response = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;

    assert_eq!(response.status(), 200);
    stored.assert_async().await;
    mirror.assert_async().await;
    let logs = captured.lock().unwrap().take().unwrap();
    let resource = &logs.resource_logs[0];
    let mut expected = vec![("service.name".to_string(), "harbor".to_string())];
    expected.extend(stamped_identity());
    assert_eq!(
        pairs(&resource.resource.as_ref().unwrap().attributes),
        expected
    );
    let records = &resource.scope_logs[0].log_records;
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].severity_text, "INFO");
    assert_eq!(
        records[0].body.as_ref().and_then(|b| b.value.as_ref()),
        Some(
            &opentelemetry_proto::tonic::common::v1::any_value::Value::StringValue(
                "love it".to_string()
            )
        )
    );
    assert_eq!(
        string_value(&records[0].attributes, ATTR_SPAN_NAME),
        Some("app.feedback")
    );
    assert_eq!(
        hex::encode(&records[0].trace_id),
        "0af7651916cd43dd8448eb211c80319c"
    );
}
