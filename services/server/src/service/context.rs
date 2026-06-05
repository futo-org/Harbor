//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use std::sync::Arc;

use sea_orm::DatabaseConnection;

use crate::service::proofs::cache::ProofCache;
use common_kafka::FutureProducer;

pub struct ServiceContext {
    pub db: DatabaseConnection,
    pub proof_cache: Arc<ProofCache>,
    pub kafka_producer: FutureProducer,
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
        })
    }
}
