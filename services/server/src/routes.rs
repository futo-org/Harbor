use axum::{
    Router,
    extract::{Path, Query, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::grpc::reflection_ui::reflection_ui;
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::content::content_repository as ContentRepository;
use crate::service::proto::ContentDigest;
use crate::util;
use crate::util::safe_http;

#[derive(Clone)]
struct AppState {
    db: DatabaseConnection,
    filestore: ContentFilestore,
}

/// Routes defined here for the polycentric server
pub fn build_routes(
    db: DatabaseConnection,
    filestore: ContentFilestore,
) -> Router {
    let state = AppState { db, filestore };

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::any())
        .allow_methods([Method::GET, Method::OPTIONS])
        .max_age(std::time::Duration::from_secs(86400));

    Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/status", get(|| async { "OK." }))
        .route("/docs", get(reflection_ui))
        .route("/blob/{digest_id}", get(get_blob))
        .route("/image_proxy", get(image_proxy))
        .with_state(state)
        .layer(cors)
}

/// Serve a blob body by its content digest. `digest_id` is encoded as
/// `{digest_type}_{hex(digest_value)}`, e.g. `1_<64 hex chars>` for
/// SHA256. This matches the on-disk key format.
async fn get_blob(
    State(state): State<AppState>,
    Path(digest_id): Path<String>,
) -> Result<Response, StatusCode> {
    let digest = parse_digest_id(&digest_id).ok_or(StatusCode::BAD_REQUEST)?;

    let row = ContentRepository::Query::find_blob_by_digest(
        &state.db,
        digest.r#type as i16,
        &digest.value,
    )
    .await
    .map_err(|e| {
        eprintln!("get_blob db error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let body = state.filestore.read_blob(&digest).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            StatusCode::NOT_FOUND
        } else {
            eprintln!("get_blob filestore error: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    Ok(([(header::CONTENT_TYPE, row.mime_type)], body).into_response())
}

/// Max image we'll proxy. Preview thumbnails are small; this bounds memory.
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

/// Proxy an image from an untrusted URL (`?url=`), for link-preview display.
/// Fetches through the SSRF-protected client, verifies the response is an
/// image, and streams it back with the upstream content type. This keeps
/// reader IPs off third-party hosts and sidesteps mixed-content/CORS issues
/// that arise when the client loads remote images directly.
async fn image_proxy(
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, StatusCode> {
    let url = params.get("url").ok_or(StatusCode::BAD_REQUEST)?;

    let mut resp = safe_http::get(url).await.map_err(|e| match e {
        // Bad/blocked URL is a client error; a fetch failure is upstream's.
        safe_http::FetchError::InvalidUrl(_) => StatusCode::BAD_REQUEST,
        safe_http::FetchError::Request(_) => StatusCode::BAD_GATEWAY,
    })?;

    if !resp.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }

    // Only proxy images — never echo back arbitrary content typed as one.
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.starts_with("image/") {
        return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }

    // Read at most MAX_IMAGE_BYTES; reject anything larger rather than truncate.
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) =
        resp.chunk().await.map_err(|_| StatusCode::BAD_GATEWAY)?
    {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_IMAGE_BYTES {
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
    }

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
        ],
        body,
    )
        .into_response())
}

fn parse_digest_id(id: &str) -> Option<ContentDigest> {
    let (type_str, hex_str) = id.split_once('_')?;
    let r#type = type_str.parse::<i32>().ok()?;
    let value = util::hex::decode(hex_str).ok()?;
    Some(ContentDigest { r#type, value })
}
