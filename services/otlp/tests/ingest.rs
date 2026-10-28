//! The otlp service end to end: real JWTs, identity documents fetched from a
//! polycentric server over gRPC, and payloads forwarded to a VictoriaLogs
//! stand-in.

mod support;

use ed25519_dalek::SigningKey;
use otlp_service::forward::{ATTR_IDENTITY, ATTR_SIGNING_KEY};
use otlp_service::routes::LOGS_PATH;
use otlp_service::spans::ATTR_SPAN_NAME;
use serde_json::{Value, json};
use support::{Otlp, PolycentricStandIn, device_key, identity_for, mint, now};

const JSON: &str = "application/json";

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

fn stamped(resource_key: &str, head: Vec<Value>) -> Value {
    let (identity, _) = identity_for(&device_key());
    let mut attributes = head;
    attributes.push(json!({ "key": ATTR_IDENTITY, "value": { "stringValue": identity } }));
    attributes.push(json!({ "key": ATTR_SIGNING_KEY, "value": {
        "stringValue": hex::encode(device_key().verifying_key().to_bytes())
    } }));
    json!({ resource_key: [{ "resource": { "attributes": attributes } }] })
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
async fn a_paired_device_gets_its_spans_to_victoria_logs_as_records() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    let mut expected = stamped(
        "resourceLogs",
        vec![json!({ "key": "service.name", "value": { "stringValue": "harbor" } })],
    );
    expected["resourceLogs"][0]["scopeLogs"] = json!([{ "logRecords": [
        {
            "timeUnixNano": "1700000000000000000",
            "severityText": "INFO",
            "body": { "stringValue": "app.feedback" },
            "traceId": "0af7651916cd43dd8448eb211c80319c",
            "spanId": "b7ad6b7169203331",
            "attributes": [
                { "key": "harbor.feedback.message", "value": { "stringValue": "love it" } },
                { "key": ATTR_SPAN_NAME, "value": { "stringValue": "app.feedback" } }
            ]
        },
        {
            "timeUnixNano": "1699999999000000000",
            "severityText": "WARN",
            "body": { "stringValue": "slow feed" },
            "traceId": "0af7651916cd43dd8448eb211c80319c"
        }
    ]}]);
    let mock = victoria
        .mock("POST", LOGS_PATH)
        .match_header("content-type", JSON)
        .match_header(
            "VL-Stream-Fields",
            "service.name,service.version,deployment.environment.name,os.name",
        )
        .match_body(mockito::Matcher::PartialJson(expected))
        .create_async()
        .await;

    let token = otlp.token(&device_key());
    let response = otlp.post("/v1/traces", Some(&token), JSON, spans()).await;

    assert_eq!(response.status(), 200);
    mock.assert_async().await;
}

#[tokio::test]
async fn logs_reach_victoria_logs() {
    let (otlp, mut victoria) = otlp_with_victoria().await;
    let mock = victoria
        .mock("POST", LOGS_PATH)
        .match_header(
            "VL-Stream-Fields",
            "service.name,service.version,deployment.environment.name,os.name",
        )
        .match_body(mockito::Matcher::PartialJson(stamped(
            "resourceLogs",
            vec![],
        )))
        .create_async()
        .await;

    let token = otlp.token(&device_key());
    let response = otlp.post("/v1/logs", Some(&token), JSON, logs()).await;

    assert_eq!(response.status(), 200);
    mock.assert_async().await;
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
        .mock("POST", LOGS_PATH)
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
        .mock("POST", LOGS_PATH)
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
        .mock("POST", LOGS_PATH)
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
