//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use crate::service::proofs::cache::ProofCache;
use common_kafka::FutureProducer;
use sea_orm::DatabaseConnection;
use std::sync::Arc;

pub struct ServiceContext {
    pub db: DatabaseConnection,
    pub proof_cache: Arc<ProofCache>,
    pub kafka_producer: FutureProducer,
    pub trusted_moderator: Option<String>, // `None` means no content labels
}

impl ServiceContext {
    pub fn new(
        db: DatabaseConnection,
        kafka_producer: FutureProducer,
    ) -> Arc<Self> {
        Arc::new(Self {
            db,
            proof_cache: ProofCache::new(),
            kafka_producer,
            trusted_moderator: crate::config::get().trusted_moderator.clone(),
        })
    }
}
