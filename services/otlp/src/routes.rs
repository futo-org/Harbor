use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Extension, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::routing::{get, post};
use axum::{Router, middleware};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::auth::{AuthenticatedIdentity, auth_middleware};
use crate::config::Config;
use crate::forward::{forward, stamp};
use crate::identity::Identities;

pub const LOGS_PATH: &str = "/insert/opentelemetry/v1/logs";
pub const TRACES_PATH: &str = "/insert/opentelemetry/v1/traces";

#[derive(Clone)]
pub struct AppState {
    pub config: &'static Config,
    pub http: reqwest::Client,
    pub identities: Arc<dyn Identities>,
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
}

async fn post_logs(
    State(state): State<AppState>,
    Extension(identity): Extension<AuthenticatedIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(base) = state.config.victoria_logs_url.as_deref() else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    ingest(
        &state,
        &identity,
        &headers,
        body,
        "resourceLogs",
        &format!("{base}{LOGS_PATH}"),
    )
    .await
}

async fn post_traces(
    State(state): State<AppState>,
    Extension(identity): Extension<AuthenticatedIdentity>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(base) = state.config.victoria_traces_url.as_deref() else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    ingest(
        &state,
        &identity,
        &headers,
        body,
        "resourceSpans",
        &format!("{base}{TRACES_PATH}"),
    )
    .await
}

async fn ingest(
    state: &AppState,
    identity: &AuthenticatedIdentity,
    headers: &HeaderMap,
    body: Bytes,
    resource_key: &str,
    url: &str,
) -> StatusCode {
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("application/json"));
    if !is_json {
        return StatusCode::UNSUPPORTED_MEDIA_TYPE;
    }
    let mut payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(payload) => payload,
        Err(_) => return StatusCode::BAD_REQUEST,
    };
    stamp(&mut payload, resource_key, identity);
    forward(&state.http, url, &payload).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::now_secs;
    use crate::forward::{ATTR_IDENTITY, ATTR_SIGNING_KEY};
    use crate::testing::{AUD, ISS, mint, signing_key, signing_key_hex, state};
    use axum::body::Body;
    use ed25519_dalek::SigningKey;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    fn app(logs_url: Option<String>, traces_url: Option<String>) -> Router {
        build_routes(state(logs_url, traces_url))
    }

    fn token() -> String {
        mint(&signing_key(), ISS, AUD, now_secs() + 60)
    }

    fn request(
        path: &str,
        token: Option<&str>,
        content_type: &str,
        body: String,
    ) -> http::Request<Body> {
        let mut builder = http::Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", content_type);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        builder.body(Body::from(body)).unwrap()
    }

    fn spans() -> Value {
        json!({ "resourceSpans": [{
            "resource": { "attributes": [
                { "key": "service.name", "value": { "stringValue": "harbor" } },
                { "key": ATTR_IDENTITY, "value": { "stringValue": "spoofed" } }
            ]},
            "scopeSpans": []
        }]})
    }

    fn logs() -> Value {
        json!({ "resourceLogs": [{ "scopeLogs": [] }] })
    }

    #[tokio::test]
    async fn status_needs_no_token() {
        let request = http::Request::builder()
            .uri("/status")
            .body(Body::empty())
            .unwrap();
        let response = app(None, None).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn rejects_requests_without_a_token() {
        let response = app(None, None)
            .oneshot(request(
                "/v1/traces",
                None,
                "application/json",
                spans().to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_signers_the_identity_does_not_authorize() {
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let token = mint(&other, ISS, AUD, now_secs() + 60);
        let response = app(None, None)
            .oneshot(request(
                "/v1/traces",
                Some(&token),
                "application/json",
                spans().to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn reports_unconfigured_signals() {
        for (path, body) in [("/v1/traces", spans()), ("/v1/logs", logs())] {
            let response = app(None, None)
                .oneshot(request(
                    path,
                    Some(&token()),
                    "application/json",
                    body.to_string(),
                ))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE, "{path}");
        }
    }

    #[tokio::test]
    async fn rejects_non_json_bodies() {
        let response = app(None, Some("http://unused".into()))
            .oneshot(request(
                "/v1/traces",
                Some(&token()),
                "application/x-protobuf",
                "x".into(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }

    #[tokio::test]
    async fn rejects_malformed_json() {
        let response = app(None, Some("http://unused".into()))
            .oneshot(request(
                "/v1/traces",
                Some(&token()),
                "application/json",
                "{".into(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn rejects_bodies_over_the_limit() {
        let big = format!(
            r#"{{"resourceSpans":[],"pad":"{}"}}"#,
            "x".repeat(2 * 1024 * 1024)
        );
        let response = app(None, Some("http://unused".into()))
            .oneshot(request(
                "/v1/traces",
                Some(&token()),
                "application/json",
                big,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[tokio::test]
    async fn stamps_the_verified_identity_and_forwards_traces() {
        let mut upstream = mockito::Server::new_async().await;
        let mock = upstream
            .mock("POST", TRACES_PATH)
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJson(json!({ "resourceSpans": [{
                "resource": { "attributes": [
                    { "key": "service.name", "value": { "stringValue": "harbor" } },
                    { "key": ATTR_IDENTITY, "value": { "stringValue": ISS } },
                    { "key": ATTR_SIGNING_KEY, "value": { "stringValue": signing_key_hex() } }
                ]}
            }]})))
            .with_status(200)
            .create_async()
            .await;

        let response = app(None, Some(upstream.url()))
            .oneshot(request(
                "/v1/traces",
                Some(&token()),
                "application/json",
                spans().to_string(),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn forwards_logs_to_victoria_logs() {
        let mut upstream = mockito::Server::new_async().await;
        let mock = upstream
            .mock("POST", LOGS_PATH)
            .match_body(mockito::Matcher::PartialJson(json!({ "resourceLogs": [{
                "resource": { "attributes": [
                    { "key": ATTR_IDENTITY, "value": { "stringValue": ISS } }
                ]}
            }]})))
            .with_status(200)
            .create_async()
            .await;

        let response = app(Some(upstream.url()), None)
            .oneshot(request(
                "/v1/logs",
                Some(&token()),
                "application/json",
                logs().to_string(),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn upstream_failures_are_a_bad_gateway() {
        let mut upstream = mockito::Server::new_async().await;
        upstream
            .mock("POST", TRACES_PATH)
            .with_status(503)
            .create_async()
            .await;
        let response = app(None, Some(upstream.url()))
            .oneshot(request(
                "/v1/traces",
                Some(&token()),
                "application/json",
                spans().to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }
}
