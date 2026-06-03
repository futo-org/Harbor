//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use std::sync::Arc;

use sea_orm::DatabaseConnection;

use crate::service::notifications::manager::NotificationManager;
use crate::service::proofs::cache::ProofCache;

pub struct ServiceContext {
    pub db: DatabaseConnection,
    pub proof_cache: Arc<ProofCache>,
    /// Present in the running server so event ingestion can enqueue push
    /// notifications. `None` in unit tests that build a bare context.
    pub notification_manager: Option<Arc<NotificationManager>>,
}

impl ServiceContext {
    pub fn new(
        db: DatabaseConnection,
        notification_manager: Option<Arc<NotificationManager>>,
    ) -> Arc<Self> {
        Arc::new(Self {
            db,
            proof_cache: ProofCache::new(),
            notification_manager,
        })
    }
}
