use axum::{
    Router,
    extract::{Path, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use sea_orm::DatabaseConnection;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::grpc::reflection_ui::reflection_ui;
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::content::content_repository as ContentRepository;
use crate::service::proto::ContentDigest;
use crate::util;

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

fn parse_digest_id(id: &str) -> Option<ContentDigest> {
    let (type_str, hex_str) = id.split_once('_')?;
    let r#type = type_str.parse::<i32>().ok()?;
    let value = util::hex::decode(hex_str).ok()?;
    Some(ContentDigest { r#type, value })
}
