//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use crate::service::proofs::cache::ProofCache;
use common_kafka::FutureProducer;
use sea_orm::DatabaseConnection;
use std::{env::var, sync::Arc};

/// Environment variable of hex identity string of the trusted moderation service.
const TRUSTED_MODERATOR_ENV: &str = "POLYCENTRIC_MODERATION_IDENTITY";

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
            trusted_moderator: var(TRUSTED_MODERATOR_ENV)
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        })
    }
}
