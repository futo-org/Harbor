//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use std::sync::Arc;

use sea_orm::DatabaseConnection;

use crate::service::proofs::proofs_cache::ProofCache;

pub struct ServiceContext {
    pub db: DatabaseConnection,
    pub proof_cache: Arc<ProofCache>,
}

impl ServiceContext {
    pub fn new(db: DatabaseConnection) -> Arc<Self> {
        Arc::new(Self {
            db,
            proof_cache: ProofCache::new(),
        })
    }
}
