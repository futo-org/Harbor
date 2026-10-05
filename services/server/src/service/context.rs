//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use crate::service::proofs::cache::ProofCache;
use common_kafka::FutureProducer;
use sea_orm::DatabaseConnection;
use std::sync::Arc;

pub struct ServiceContext {
    /// Read/write database connection pool.
    pub db: DatabaseConnection,
    /// Read-only database connection pool.
    pub ro_db: DatabaseConnection,
    pub proof_cache: Arc<ProofCache>,
    pub kafka_producer: FutureProducer,
}

impl ServiceContext {
    pub fn new(
        db: DatabaseConnection,
        ro_db: DatabaseConnection,
        kafka_producer: FutureProducer,
    ) -> Arc<Self> {
        Arc::new(Self {
            db,
            ro_db,
            proof_cache: ProofCache::new(),
            kafka_producer,
        })
    }
}

pub struct RequestContext<'a> {
    pub service: &'a ServiceContext,
    /// The authenticated caller--`None` for anonymous requests.
    pub caller: Option<&'a str>,
}

impl<'a> RequestContext<'a> {
    pub fn new(
        service: &'a ServiceContext,
        caller: Option<&'a str>,
    ) -> RequestContext<'a> {
        RequestContext { service, caller }
    }
}
