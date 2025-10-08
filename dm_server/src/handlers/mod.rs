pub mod auth;
pub mod dm;
pub mod keys;

use axum::extract::FromRef;
use std::sync::Arc;

use crate::{db::DatabaseManager, websocket::WebSocketManager};

/// Shared application state
#[derive(Clone, FromRef)]
pub struct AppState {
    pub db: Arc<DatabaseManager>,
    pub ws_manager: WebSocketManager,
}
