//! End to end: a real listener, a real HTTP client and a mock Victoria.

use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signer, SigningKey};
use otlp_service::config::Config;
use otlp_service::identity::Identities;
use otlp_service::routes::{AppState, LOGS_PATH, TRACES_PATH, build_routes};
use polycentric_common::models::protos_v2::PublicKey;
use serde_json::json;

const ISS: &str = "identity-e2e";

struct OnlyKnownDevice;

#[tonic::async_trait]
impl Identities for OnlyKnownDevice {
    async fn authorizes(&self, identity: &str, signer: &PublicKey) -> Result<bool, String> {
        Ok(identity == ISS && signer.key == device_key().verifying_key().to_bytes())
    }
}

fn device_key() -> SigningKey {
    SigningKey::from_bytes(&[42u8; 32])
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn mint(key: &SigningKey, aud: &str) -> String {
    let kid = hex::encode(key.verifying_key().to_bytes());
    let header = format!(r#"{{"alg":"EdDSA","typ":"JWT","kid":"{kid}"}}"#);
    let claims = format!(
        r#"{{"iss":"{ISS}","aud":"{aud}","iat":0,"exp":{}}}"#,
        now() + 60
    );
    let signing_input = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(header),
        URL_SAFE_NO_PAD.encode(claims)
    );
    let signature = key.sign(signing_input.as_bytes());
    format!(
        "{signing_input}.{}",
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    )
}

/// Serves the app on a random port and returns its public URL.
async fn serve(victoria: &str) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let config: &'static Config = Box::leak(Box::new(Config {
        addr: listener.local_addr().unwrap(),
        allow_hosts: vec![url.clone()],
        query_servers: vec![],
        victoria_logs_url: Some(victoria.to_string()),
        victoria_traces_url: Some(victoria.to_string()),
        max_body_bytes: 1024 * 1024,
    }));
    let state = AppState {
        config,
        http: reqwest::Client::new(),
        identities: Arc::new(OnlyKnownDevice),
    };
    tokio::spawn(async move {
        axum::serve(listener, build_routes(state)).await.unwrap();
    });
    url
}

#[tokio::test]
async fn authenticated_logs_and_traces_reach_victoria_stamped() {
    let mut victoria = mockito::Server::new_async().await;
    let logs = victoria
        .mock("POST", LOGS_PATH)
        .match_body(mockito::Matcher::PartialJson(json!({ "resourceLogs": [{
            "resource": { "attributes": [
                { "key": "harbor.auth.identity", "value": { "stringValue": ISS } }
            ]}
        }]})))
        .with_status(200)
        .create_async()
        .await;
    let traces = victoria
        .mock("POST", TRACES_PATH)
        .match_body(mockito::Matcher::PartialJson(json!({ "resourceSpans": [{
            "resource": { "attributes": [
                { "key": "harbor.auth.identity", "value": { "stringValue": ISS } },
                { "key": "harbor.auth.signing_key", "value": {
                    "stringValue": hex::encode(device_key().verifying_key().to_bytes())
                } }
            ]}
        }]})))
        .with_status(200)
        .create_async()
        .await;

    let base = serve(&victoria.url()).await;
    let client = reqwest::Client::new();
    let token = mint(&device_key(), &base);

    for (path, body) in [
        ("/v1/logs", json!({ "resourceLogs": [{ "scopeLogs": [] }] })),
        (
            "/v1/traces",
            json!({ "resourceSpans": [{ "scopeSpans": [] }] }),
        ),
    ] {
        let response = client
            .post(format!("{base}{path}"))
            .bearer_auth(&token)
            .header("content-type", "application/json")
            .body(body.to_string())
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{path}");
    }
    logs.assert_async().await;
    traces.assert_async().await;
}

#[tokio::test]
async fn an_unpaired_device_is_turned_away_before_victoria() {
    let mut victoria = mockito::Server::new_async().await;
    let traces = victoria
        .mock("POST", TRACES_PATH)
        .with_status(200)
        .expect(0)
        .create_async()
        .await;

    let base = serve(&victoria.url()).await;
    let stranger = SigningKey::from_bytes(&[1u8; 32]);
    let response = reqwest::Client::new()
        .post(format!("{base}/v1/traces"))
        .bearer_auth(mint(&stranger, &base))
        .header("content-type", "application/json")
        .body(json!({ "resourceSpans": [] }).to_string())
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 403);
    traces.assert_async().await;
}

#[tokio::test]
async fn preflight_allows_the_browser_client() {
    let base = serve("http://unused").await;
    let response = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("{base}/v1/traces"))
        .header("origin", "https://harbor.social")
        .header("access-control-request-method", "POST")
        .header(
            "access-control-request-headers",
            "authorization,content-type",
        )
        .send()
        .await
        .unwrap();

    assert!(response.status().is_success());
    let allowed = response
        .headers()
        .get("access-control-allow-headers")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    assert!(allowed.contains("authorization"), "{allowed}");
}
