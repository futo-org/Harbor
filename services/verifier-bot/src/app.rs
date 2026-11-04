//! The HTTP API. Routes are generated from the platform list:
//!
//! * `GET  /identity`, `GET /platforms`, `GET /platforms/{slug}`, `GET /metrics`
//! * `POST /platforms/{slug}/{type}/verify` (any verifier)
//! * `POST /platforms/{slug}/{type}/check` (pre-check without a claim)
//! * `GET  /platforms/{slug}/{type}/health-check`
//! * `POST /platforms/{slug}/text/get-claim-fields-by-url` (text verifiers)
//! * `GET  /platforms/{slug}/oauth/url`, `GET /platforms/{slug}/oauth/token`
//!   (OAuth verifiers) and `GET /platforms/{name}/oauth/callback`

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};
use serde::Deserialize;
use serde_json::{Value, json};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::claims::{ClaimBackend, ClaimField};
use crate::error::VResult;
use crate::health::run_health_check;
use crate::metrics::{self, HTTP_DURATION, HTTP_REQUESTS, OAUTH_SESSIONS_PENDING, route_labels};
use crate::platforms::Platform;
use crate::util::{decode_object, encode_uri_component, object_id, slug};
use crate::verifier::{OAuthUrl, Verifier, VerifierKind, VerifyRequest};

/// How long an OAuth sign-in may take before its session is forgotten.
const OAUTH_SESSION_TTL: Duration = Duration::from_secs(15 * 60);

struct Entry {
    value: String,
    expires: Instant,
}

/// Values that expire [`OAUTH_SESSION_TTL`] after they are stored and are
/// handed out at most once.
#[derive(Default)]
struct ExpiringMap(Mutex<HashMap<String, Entry>>);

impl ExpiringMap {
    fn store(&self, key: &str, value: &str) {
        let now = Instant::now();
        let mut map = self.0.lock().unwrap();
        map.retain(|_, e| e.expires > now);
        map.insert(
            key.to_string(),
            Entry {
                value: value.to_string(),
                expires: now + OAUTH_SESSION_TTL,
            },
        );
    }

    fn take(&self, key: &str) -> Option<String> {
        let entry = self.0.lock().unwrap().remove(key)?;
        (entry.expires > Instant::now()).then_some(entry.value)
    }

    fn live(&self) -> usize {
        let now = Instant::now();
        self.0
            .lock()
            .unwrap()
            .values()
            .filter(|e| e.expires > now)
            .count()
    }
}

/// OAuth sign-ins in flight.
#[derive(Default)]
pub struct Sessions {
    /// OAuth 1 request token secrets, by request token.
    secrets: ExpiringMap,
    /// Where to send the browser after the callback, keyed by `state`
    /// (OAuth 2) or request token (OAuth 1).
    redirects: ExpiringMap,
}

impl Sessions {
    /// Sign-ins started but not yet called back.
    pub fn pending(&self) -> usize {
        self.redirects.live()
    }
}

pub struct App {
    pub backend: Arc<dyn ClaimBackend>,
    /// The identity the bot publishes verifications under.
    pub identity: Option<String>,
    pub platforms: Vec<Platform>,
    /// URL prefixes the OAuth callback may redirect to.
    pub allowed_callbacks: Vec<String>,
    pub sessions: Sessions,
}

impl App {
    fn platform(&self, slug_: &str) -> Option<&Platform> {
        self.platforms.iter().find(|p| slug(p.name) == slug_)
    }

    fn verifier(&self, slug_: &str, kind: &str) -> Option<&Arc<Verifier>> {
        self.platform(slug_)?
            .verifiers
            .iter()
            .find(|v| v.verifier_type().as_str() == kind)
    }

    fn is_allowed_callback(&self, redirect: &str) -> bool {
        self.allowed_callbacks
            .iter()
            .any(|prefix| redirect.starts_with(prefix.as_str()))
    }
}

type Shared = State<Arc<App>>;
type Params = Query<Vec<(String, String)>>;

/// The first value of query parameter `name`.
fn param<'a>(params: &'a [(String, String)], name: &str) -> Option<&'a str> {
    params
        .iter()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v.as_str())
}

fn json_response(status: StatusCode, body: Value) -> Response {
    (status, axum::Json(body)).into_response()
}

fn bad_request(message: &str) -> Response {
    json_response(StatusCode::BAD_REQUEST, json!({ "message": message }))
}

fn not_found(method: &Method, path: &str) -> Response {
    (StatusCode::NOT_FOUND, format!("Cannot {method} {path}")).into_response()
}

/// `200` with the value (or `{ success: true }` for `()`), else the error.
fn write_result<T: serde::Serialize>(result: VResult<T>) -> Response {
    match result {
        Ok(value) => match serde_json::to_value(value) {
            Ok(Value::Null) => json_response(StatusCode::OK, json!({ "success": true })),
            Ok(value) => json_response(StatusCode::OK, value),
            Err(e) => unknown_error("serializing a response", &e.to_string()),
        },
        Err(e) => e.into_response(),
    }
}

/// A 500 for something that should not have failed, with an id to find the
/// log line by.
fn unknown_error(context: &str, detail: &str) -> Response {
    let request_id = object_id();
    tracing::error!("[500 ERROR] ({request_id}) {context}\n{detail}");
    json_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        json!({
            "message": format!("An unknown error has occurred (Request Id: {request_id})"),
            "extendedMessage": format!("Internal server error while {context}"),
        }),
    )
}

fn content_type(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::CONTENT_TYPE)?.to_str().ok()
}

/// A JSON request body, parsed when the request says it is JSON (`null`
/// otherwise); `Err` is the message for a malformed one.
fn json_body(headers: &HeaderMap, body: &Bytes) -> Result<Value, String> {
    let is_json = content_type(headers)
        .and_then(|ct| ct.split(';').next())
        .is_some_and(|ct| ct.trim().eq_ignore_ascii_case("application/json"));
    if !is_json {
        return Ok(Value::Null);
    }
    serde_json::from_slice(body).map_err(|e| format!("Invalid JSON body: {e}"))
}

/// `body.claimFields` as claim fields, if it's an array of them.
fn claim_fields(body: &Value) -> Option<Vec<ClaimField>> {
    serde_json::from_value(body.get("claimFields")?.clone()).ok()
}

async fn identity(State(app): Shared) -> Response {
    json_response(
        StatusCode::OK,
        match &app.identity {
            Some(identity) => json!({ "identity": identity }),
            None => json!({}),
        },
    )
}

async fn list_platforms(State(app): Shared) -> Response {
    let platforms: Vec<Value> = app
        .platforms
        .iter()
        .map(|p| {
            json!({
                "name": p.name,
                "slug": slug(p.name),
                // 'text'/'oauth': which flows the bot supports.
                "verifiers": p.verifiers.iter().map(|v| v.verifier_type().as_str()).collect::<Vec<_>>(),
            })
        })
        .collect();
    json_response(StatusCode::OK, Value::Array(platforms))
}

async fn platform_detail(
    State(app): Shared,
    Path(slug_): Path<String>,
    request: Request,
) -> Response {
    let Some(platform) = app.platform(&slug_) else {
        return not_found(request.method(), request.uri().path());
    };
    let verifiers: Vec<Value> = platform
        .verifiers
        .iter()
        .map(|v| {
            json!({
                "verifierType": v.verifier_type().as_str(),
                "platform": platform.name,
                "slug": slug(platform.name),
            })
        })
        .collect();
    json_response(StatusCode::OK, Value::Array(verifiers))
}

async fn metrics_route(State(app): Shared) -> Response {
    OAUTH_SESSIONS_PENDING.set(app.sessions.pending() as f64);
    match metrics::render() {
        Ok(body) => ([(header::CONTENT_TYPE, metrics::CONTENT_TYPE)], body).into_response(),
        Err(e) => {
            tracing::error!("failed to render metrics: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize)]
struct ActionPath {
    slug: String,
    kind: String,
    action: String,
}

/// `GET /platforms/{slug}/{type}/{action}`.
async fn get_action(
    State(app): Shared,
    Path(path): Path<ActionPath>,
    Query(params): Params,
    request: Request,
) -> Response {
    if path.kind == "oauth" && path.action == "callback" {
        return oauth_callback(&app, &path.slug, &params);
    }
    let Some(verifier) = app.verifier(&path.slug, &path.kind) else {
        return not_found(request.method(), request.uri().path());
    };
    match (path.action.as_str(), &verifier.kind) {
        ("health-check", _) => write_result(run_health_check(verifier).await),
        ("url", VerifierKind::OAuth(oauth)) => {
            // Where the callback sends the browser afterwards. Must be on the
            // ALLOWED_CALLBACKS list.
            let Some(redirect) = param(&params, "redirect").filter(|r| app.is_allowed_callback(r))
            else {
                return bad_request("redirect is missing or not an allowed callback.");
            };
            match oauth.oauth_url().await {
                Ok(OAuthUrl::OAuth2(url)) => {
                    // The provider echoes `state` back: key the session by
                    // it, adding one if the verifier didn't.
                    let Ok(mut url) = url::Url::parse(&url) else {
                        return unknown_error("fetching OAuth URL", &format!("invalid URL {url}"));
                    };
                    let state = match url.query_pairs().find(|(k, _)| k == "state") {
                        Some((_, state)) => state.into_owned(),
                        None => {
                            let state = object_id();
                            let pairs: Vec<(String, String)> =
                                url.query_pairs().into_owned().collect();
                            url.query_pairs_mut()
                                .clear()
                                .extend_pairs(pairs)
                                .append_pair("state", &state);
                            state
                        }
                    };
                    app.sessions.redirects.store(&state, redirect);
                    json_response(StatusCode::OK, json!({ "url": url.to_string() }))
                }
                Ok(OAuthUrl::OAuth1 { url, token, secret }) => {
                    app.sessions.secrets.store(&token, &secret);
                    // OAuth 1: the callback carries the request token.
                    app.sessions.redirects.store(&token, redirect);
                    json_response(StatusCode::OK, json!({ "url": url }))
                }
                Err(e) => e.into_response(),
            }
        }
        ("token", VerifierKind::OAuth(oauth)) => {
            let Some(challenge) = param(&params, "oauthData").filter(|c| !c.is_empty()) else {
                return json_response(
                    StatusCode::BAD_REQUEST,
                    json!({
                        "message": "Missing oauthData parameter",
                        "extendedMessage": "The required oauthData query parameter was not provided.",
                    }),
                );
            };
            match decode_object::<Value>(challenge) {
                Ok(data) => write_result(oauth.get_token(&data).await),
                Err(e) => json_response(
                    StatusCode::BAD_REQUEST,
                    json!({
                        "message": "Invalid format for oauthData parameter",
                        "extendedMessage": format!("Failed to decode base64 or parse JSON: {e}"),
                    }),
                ),
            }
        }
        _ => not_found(request.method(), request.uri().path()),
    }
}

/// `POST /platforms/{slug}/{type}/{action}`.
async fn post_action(
    State(app): Shared,
    Path(path): Path<ActionPath>,
    Query(params): Params,
    headers: HeaderMap,
    request: Request,
) -> Response {
    let Some(verifier) = app.verifier(&path.slug, &path.kind) else {
        return not_found(request.method(), request.uri().path());
    };
    let (method, uri) = (request.method().clone(), request.uri().clone());
    let Ok(body) = axum::body::to_bytes(request.into_body(), 16 * 1024 * 1024).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    match (path.action.as_str(), &verifier.kind) {
        ("verify", _) => verify(&app, verifier, &headers, &body, &params).await,
        ("check", VerifierKind::OAuth(oauth)) => {
            // Pre-check without a claim: does the token's account match?
            let body = match json_body(&headers, &body) {
                Ok(body) => body,
                Err(message) => return bad_request(&message),
            };
            let challenge = body.get("challengeResponse").and_then(Value::as_str);
            let (Some(fields), Some(challenge)) = (claim_fields(&body), challenge) else {
                return bad_request("Expected { claimFields: [], challengeResponse: string }.");
            };
            write_result(oauth.is_token_valid(challenge, &fields).await)
        }
        ("check", VerifierKind::Text(text)) => {
            // Pre-check without a claim: is the token in the profile?
            let body = match json_body(&headers, &body) {
                Ok(body) => body,
                Err(message) => return bad_request(&message),
            };
            let token = body.get("token").and_then(Value::as_str);
            let (Some(fields), Some(token)) = (claim_fields(&body), token) else {
                return bad_request("Expected { claimFields: [], token: string }.");
            };
            write_result(Verifier::check_fields(text.as_ref(), &fields, token).await)
        }
        ("get-claim-fields-by-url", VerifierKind::Text(text)) => {
            let body = match json_body(&headers, &body) {
                Ok(body) => body,
                Err(message) => return bad_request(&message),
            };
            let Some(url) = body.get("url").and_then(Value::as_str) else {
                return bad_request("Expected { url: string }.");
            };
            write_result(text.get_claim_fields_by_url(url).await)
        }
        _ => not_found(&method, uri.path()),
    }
}

/// `POST /platforms/{slug}/{type}/verify`: the claim id as JSON
/// (`{ claimId }`, hex) or as the raw `EventKey` bytes.
async fn verify(
    app: &App,
    verifier: &Verifier,
    headers: &HeaderMap,
    body: &Bytes,
    params: &[(String, String)],
) -> Response {
    let content_type = content_type(headers);
    let binary = match content_type {
        Some("application/octet-stream") => true,
        Some("application/json") => {
            if let Err(e) = serde_json::from_slice::<Value>(body) {
                return bad_request(&format!("Invalid JSON body: {e}"));
            }
            false
        }
        other => {
            tracing::info!("requestVerify(400): Invalid Content-Type. {other:?}");
            return (StatusCode::BAD_REQUEST, "Invalid Content-Type").into_response();
        }
    };

    let result = verifier
        .request_verify(
            app.backend.as_ref(),
            VerifyRequest {
                content_type,
                body,
                challenge_response: param(params, "challengeResponse").map(String::from),
            },
        )
        .await;
    match result {
        // The raw EventKey bytes of the verify event.
        Ok(id) if binary => (
            [(header::CONTENT_TYPE, "application/octet-stream")],
            hex::decode(id).unwrap_or_default(),
        )
            .into_response(),
        Ok(id) => json_response(StatusCode::OK, json!({ "verifyEventId": id })),
        Err(e) => e.into_response(),
    }
}

/// Characters a `Location` header can't carry raw.
const LOCATION: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'<')
    .add(b'>')
    .add(b'\\')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

/// `GET /platforms/{name}/oauth/callback`: hand the provider's response
/// back to the client at the redirect it registered, as
/// `?state={"data":<base64 JSON>,"claimType":<name>}`.
fn oauth_callback(app: &App, platform: &str, params: &[(String, String)]) -> Response {
    let expired = || (StatusCode::BAD_REQUEST, "OAuth session expired or invalid.").into_response();
    let state = param(params, "state");
    let oauth_token = param(params, "oauth_token").filter(|t| !t.is_empty());

    let query = match (
        oauth_token,
        param(params, "oauth_verifier").filter(|v| !v.is_empty()),
        param(params, "code").filter(|c| !c.is_empty()),
    ) {
        (Some(token), Some(verifier), _) => {
            let Some(secret) = app.sessions.secrets.take(token) else {
                tracing::error!("OAuth secret not found or expired for token: {token}");
                return expired();
            };
            json!({ "oauth_token": token, "oauth_verifier": verifier, "secret": secret })
        }
        (_, _, Some(code)) => match state {
            Some(state) => json!({ "code": code, "state": state }),
            None => json!({ "code": code }),
        },
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "Missing required OAuth parameters in callback.",
            )
                .into_response();
        }
    };

    let Some(redirect) = state
        .or(oauth_token)
        .and_then(|key| app.sessions.redirects.take(key))
    else {
        return expired();
    };

    #[derive(serde::Serialize)]
    struct RedirectState<'a> {
        data: String,
        #[serde(rename = "claimType")]
        claim_type: &'a str,
    }
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD.encode(query.to_string());
    let state = serde_json::to_string(&RedirectState {
        data,
        claim_type: platform,
    })
    .unwrap_or_default();
    let location = format!("{redirect}?state={}", encode_uri_component(&state));
    let location = utf8_percent_encode(&location, LOCATION).to_string();
    match HeaderValue::from_str(&location) {
        Ok(value) => (StatusCode::FOUND, [(header::LOCATION, value)]).into_response(),
        Err(e) => unknown_error("processing the OAuth callback", &e.to_string()),
    }
}

/// Count and time every request by bounded route labels.
async fn record_metrics(
    State(slugs): State<Arc<HashSet<String>>>,
    request: Request,
    next: Next,
) -> Response {
    let started = Instant::now();
    let path = request.uri().path().to_string();
    let response = next.run(request).await;
    let (platform, endpoint) = route_labels(&path, &slugs);
    HTTP_DURATION
        .with_label_values(&[platform.as_str(), endpoint.as_str()])
        .observe(started.elapsed().as_secs_f64());
    HTTP_REQUESTS
        .with_label_values(&[
            platform.as_str(),
            endpoint.as_str(),
            response.status().as_str(),
        ])
        .inc();
    response
}

async fn log_request(request: Request, next: Next) -> Response {
    tracing::info!(method = %request.method(), url = %request.uri(), "Incoming request");
    tracing::debug!(headers = ?request.headers(), "Request headers");
    next.run(request).await
}

fn cors(allowed_origins: &[String]) -> CorsLayer {
    let origins: Vec<HeaderValue> = allowed_origins
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::HeaderName::from_static("x-polycentric-user-agent"),
            header::ORIGIN,
            header::ACCEPT,
        ])
}

fn panic_response(panic: Box<dyn std::any::Any + Send + 'static>) -> Response<Body> {
    let detail = panic
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| panic.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown panic".into());
    unknown_error("handling the request", &detail)
}

pub fn router(app: Arc<App>, allowed_origins: &[String]) -> Router {
    let slugs: Arc<HashSet<String>> =
        Arc::new(app.platforms.iter().map(|p| slug(p.name)).collect());
    let api = Router::new()
        .route("/identity", get(identity))
        .route("/platforms", get(list_platforms))
        .route("/platforms/{slug}", get(platform_detail))
        .route(
            "/platforms/{slug}/{kind}/{action}",
            get(get_action).post(post_action),
        )
        .fallback(
            |request: Request| async move { not_found(request.method(), request.uri().path()) },
        )
        .layer(axum::middleware::from_fn(log_request))
        .layer(cors(allowed_origins));
    Router::new()
        // Served before CORS, like the TypeScript bot.
        .route("/metrics", get(metrics_route))
        .merge(api)
        .with_state(app)
        .layer(tower_http::catch_panic::CatchPanicLayer::custom(
            panic_response,
        ))
        .layer(axum::middleware::from_fn_with_state(slugs, record_metrics))
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use tower::ServiceExt;

    use super::*;
    use crate::claims::SCHEMA_NAME;
    use crate::claims::testing::{FakeBackend, IDENTITY};
    use crate::config::Config;
    use crate::verifier::testing::dummy;

    fn app_with(backend: Arc<FakeBackend>, platforms: Vec<Platform>) -> Router {
        let config = Config::for_tests();
        let app = Arc::new(App {
            backend,
            identity: Some("bot".into()),
            platforms,
            allowed_callbacks: config.allowed_callbacks.clone(),
            sessions: Sessions::default(),
        });
        router(app, &config.allowed_origins)
    }

    fn real_platforms() -> Vec<Platform> {
        let mut config = Config::for_tests();
        config.oauth_callback_domain = Some("https://bot.example".into());
        config.spotify.client_id = Some("spotify-id".into());
        config.discord.client_id = Some("discord-id".into());
        crate::platforms::all(&config, &crate::browser::SharedBrowser::new(None))
    }

    async fn send(
        router: &Router,
        request: axum::http::Request<Body>,
    ) -> (StatusCode, HeaderMap, Bytes) {
        let response = router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        (
            status,
            headers,
            to_bytes(response.into_body(), usize::MAX).await.unwrap(),
        )
    }

    fn get_req(uri: &str) -> axum::http::Request<Body> {
        axum::http::Request::get(uri).body(Body::empty()).unwrap()
    }

    fn post_json(uri: &str, body: Value) -> axum::http::Request<Body> {
        axum::http::Request::post(uri)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn body_json(bytes: &Bytes) -> Value {
        serde_json::from_slice(bytes).unwrap()
    }

    #[tokio::test]
    async fn lists_identity_and_platforms() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(&router, get_req("/identity")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body_json(&body), json!({ "identity": "bot" }));

        let (_, _, body) = send(&router, get_req("/platforms")).await;
        let platforms = body_json(&body);
        assert_eq!(
            platforms[0],
            json!({ "name": "Discord", "slug": "discord", "verifiers": ["oauth"] })
        );
        assert_eq!(
            platforms[3],
            json!({ "name": "Hacker News", "slug": "hacker-news", "verifiers": ["text"] })
        );
        assert_eq!(platforms.as_array().unwrap().len(), 19);

        let (_, _, body) = send(&router, get_req("/platforms/hacker-news")).await;
        assert_eq!(
            body_json(&body),
            json!([{ "verifierType": "text", "platform": "Hacker News", "slug": "hacker-news" }])
        );
        let (status, _, _) = send(&router, get_req("/platforms/nope")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        let (status, _, _) = send(&router, get_req("/platforms/github/oauth/url")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn verifies_over_http() {
        let backend = Arc::new(FakeBackend::default());
        let claim_id =
            backend.add_claim(1, SCHEMA_NAME, &[("platform", "github"), ("account", "me")]);
        let router = app_with(
            backend.clone(),
            vec![Platform {
                name: "GitHub",
                verifiers: vec![Arc::new(dummy("GitHub", IDENTITY))],
            }],
        );

        let (status, _, body) = send(
            &router,
            post_json(
                "/platforms/github/text/verify",
                json!({ "claimId": claim_id }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body:?}");
        let id = body_json(&body)["verifyEventId"]
            .as_str()
            .unwrap()
            .to_string();

        let request = axum::http::Request::post("/platforms/github/text/verify")
            .header("content-type", "application/octet-stream")
            .body(Body::from(hex::decode(&claim_id).unwrap()))
            .unwrap();
        let (status, headers, body) = send(&router, request).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[header::CONTENT_TYPE], "application/octet-stream");
        assert_eq!(hex::encode(&body).len(), id.len());

        let request = axum::http::Request::post("/platforms/github/text/verify")
            .header("content-type", "text/plain")
            .body(Body::from("x"))
            .unwrap();
        let (status, _, body) = send(&router, request).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "Invalid Content-Type");

        let (status, _, body) = send(
            &router,
            post_json("/platforms/github/text/verify", json!({ "claimId": "zz" })),
        )
        .await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            body_json(&body),
            json!({ "message": "Missing or invalid claim id." })
        );
    }

    #[tokio::test]
    async fn text_check_and_claim_fields() {
        let router = app_with(
            Arc::default(),
            vec![Platform {
                name: "GitHub",
                verifiers: vec![Arc::new(dummy("GitHub", "bio with tok"))],
            }],
        );
        let (status, _, body) = send(
            &router,
            post_json(
                "/platforms/github/text/check",
                json!({ "claimFields": [{ "key": 0, "value": "me" }], "token": "tok" }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body_json(&body), json!({ "success": true }));

        let (status, _, body) = send(
            &router,
            post_json("/platforms/github/text/check", json!({ "claimFields": [] })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body_json(&body),
            json!({ "message": "Expected { claimFields: [], token: string }." })
        );

        let (status, _, body) = send(
            &router,
            post_json(
                "/platforms/github/text/check",
                json!({ "claimFields": [{ "key": 0, "value": "me" }], "token": "other" }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            body_json(&body)["message"],
            "Unable to find token in your profile description"
        );
    }

    #[tokio::test]
    async fn real_claim_field_parsing() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(
            &router,
            post_json(
                "/platforms/github/text/get-claim-fields-by-url",
                json!({ "url": "https://github.com/futo-org" }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body_json(&body), json!([{ "key": 0, "value": "futo-org" }]));
    }

    #[tokio::test]
    async fn oauth2_flow_round_trips_through_the_callback() {
        let router = app_with(Arc::default(), real_platforms());

        // The redirect must be on the allow-list.
        let (status, _, _) = send(
            &router,
            get_req("/platforms/spotify/oauth/url?redirect=https%3A%2F%2Fevil.example"),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Spotify's URL has no state, so the bot adds one.
        let (status, _, body) = send(
            &router,
            get_req("/platforms/spotify/oauth/url?redirect=harbor%3A%2F%2Fverify"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let url = url::Url::parse(body_json(&body)["url"].as_str().unwrap()).unwrap();
        assert_eq!(url.host_str(), Some("accounts.spotify.com"));
        let pairs: HashMap<String, String> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs["client_id"], "spotify-id");
        assert_eq!(
            pairs["redirect_uri"],
            "https://bot.example/platforms/spotify/oauth/callback"
        );
        let state = pairs["state"].clone();
        assert_eq!(state.len(), 24);

        let (status, headers, _) = send(
            &router,
            get_req(&format!(
                "/platforms/spotify/oauth/callback?code=abc&state={state}"
            )),
        )
        .await;
        assert_eq!(status, StatusCode::FOUND);
        let location = headers[header::LOCATION].to_str().unwrap();
        let redirect = url::Url::parse(location).unwrap();
        assert_eq!(redirect.scheme(), "harbor");
        let returned: Value = serde_json::from_str(
            &redirect
                .query_pairs()
                .find(|(k, _)| k == "state")
                .unwrap()
                .1,
        )
        .unwrap();
        assert_eq!(returned["claimType"], "spotify");
        let data = crate::util::lenient_base64_decode(returned["data"].as_str().unwrap());
        assert_eq!(
            serde_json::from_slice::<Value>(&data).unwrap(),
            json!({ "code": "abc", "state": state })
        );
        // Keys appear in the order clients have always received them.
        assert!(location.contains("state=%7B%22data%22"), "{location}");

        // The session is single use.
        let (status, _, body) = send(
            &router,
            get_req(&format!(
                "/platforms/spotify/oauth/callback?code=abc&state={state}"
            )),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "OAuth session expired or invalid.");
    }

    #[tokio::test]
    async fn oauth_state_from_the_provider_is_kept() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(
            &router,
            get_req("/platforms/discord/oauth/url?redirect=http%3A%2F%2Flocalhost%3A8081%2Fcb"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let url = url::Url::parse(body_json(&body)["url"].as_str().unwrap()).unwrap();
        let state = url
            .query_pairs()
            .find(|(k, _)| k == "state")
            .unwrap()
            .1
            .into_owned();
        assert!(state.starts_with("{\"harborSecret\":\""), "{state}");
        let (status, headers, _) = send(
            &router,
            get_req(&format!(
                "/platforms/discord/oauth/callback?code=c&state={}",
                encode_uri_component(&state)
            )),
        )
        .await;
        assert_eq!(status, StatusCode::FOUND);
        assert!(
            headers[header::LOCATION]
                .to_str()
                .unwrap()
                .starts_with("http://localhost:8081/cb?state=")
        );
    }

    #[tokio::test]
    async fn callback_rejects_incomplete_requests() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(&router, get_req("/platforms/x/oauth/callback")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "Missing required OAuth parameters in callback.");
        let (status, _, body) = send(
            &router,
            get_req("/platforms/x/oauth/callback?oauth_token=t&oauth_verifier=v"),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body, "OAuth session expired or invalid.");
    }

    #[tokio::test]
    async fn token_requires_valid_oauth_data() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(&router, get_req("/platforms/spotify/oauth/token")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body_json(&body)["message"], "Missing oauthData parameter");
        let (status, _, body) = send(
            &router,
            get_req("/platforms/spotify/oauth/token?oauthData=bm90IGpzb24"),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body_json(&body)["message"],
            "Invalid format for oauthData parameter"
        );
    }

    #[tokio::test]
    async fn oauth_check_validates_its_body() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(
            &router,
            post_json("/platforms/x/oauth/check", json!({ "claimFields": [] })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body_json(&body),
            json!({ "message": "Expected { claimFields: [], challengeResponse: string }." })
        );
    }

    #[tokio::test]
    async fn health_check_route_reports_configuration() {
        let router = app_with(Arc::default(), real_platforms());
        let (status, _, body) = send(&router, get_req("/platforms/x/oauth/health-check")).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            body_json(&body),
            json!({ "message": "Verifier not configured: Missing X credentials" })
        );
    }

    #[tokio::test]
    async fn cors_allows_listed_origins_only() {
        let router = app_with(Arc::default(), real_platforms());
        let request = axum::http::Request::get("/platforms")
            .header("origin", "https://harbor.social")
            .body(Body::empty())
            .unwrap();
        let (_, headers, _) = send(&router, request).await;
        assert_eq!(
            headers["access-control-allow-origin"],
            "https://harbor.social"
        );
        assert_eq!(headers["access-control-allow-credentials"], "true");

        let request = axum::http::Request::get("/platforms")
            .header("origin", "https://evil.example")
            .body(Body::empty())
            .unwrap();
        let (_, headers, _) = send(&router, request).await;
        assert!(headers.get("access-control-allow-origin").is_none());

        let request = axum::http::Request::options("/platforms/github/text/verify")
            .header("origin", "http://localhost:8081")
            .header("access-control-request-method", "POST")
            .header("access-control-request-headers", "content-type")
            .body(Body::empty())
            .unwrap();
        let (status, headers, _) = send(&router, request).await;
        assert!(status.is_success());
        assert_eq!(
            headers["access-control-allow-origin"],
            "http://localhost:8081"
        );
    }

    #[tokio::test]
    async fn metrics_count_requests_by_route() {
        let router = app_with(Arc::default(), real_platforms());
        send(&router, get_req("/platforms/vimeo")).await;
        let (status, headers, body) = send(&router, get_req("/metrics")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[header::CONTENT_TYPE], metrics::CONTENT_TYPE);
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            body.lines()
                .any(|l| l.starts_with("verifier_bot_http_requests_total{")
                    && l.contains("platform=\"vimeo\"")
                    && l.contains("endpoint=\"platform\"")
                    && l.contains("status=\"200\"")),
            "{body}"
        );
        assert!(body.contains("verifier_bot_oauth_sessions_pending"));
    }

    #[test]
    fn sessions_expire_and_are_single_use() {
        let map = ExpiringMap::default();
        map.store("k", "v");
        assert_eq!(map.live(), 1);
        assert_eq!(map.take("k").as_deref(), Some("v"));
        assert_eq!(map.take("k"), None);
        map.0.lock().unwrap().insert(
            "old".into(),
            Entry {
                value: "v".into(),
                expires: Instant::now() - Duration::from_secs(1),
            },
        );
        assert_eq!(map.live(), 0);
        assert_eq!(map.take("old"), None);
    }
}
