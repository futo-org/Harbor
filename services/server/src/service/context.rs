//! Shared service context — DB connection plus long-lived caches that
//! handlers borrow rather than reconstruct per-request.

use std::sync::Arc;

use common_kafka::FutureProducer;
use sea_orm::DatabaseConnection;
use tonic::Status;

use crate::db::DbConn;
use crate::service::auth::authenticated_identity;
use crate::service::proofs::cache::ProofCache;

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

    pub(crate) async fn to_context_ro(&self) -> Result<PublicContext, Status> {
        PublicContext::new(
            &self.ro_db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
        )
        .await
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

/// Request [`Context`] where the user is authenticated.
pub(crate) type AuthContext = Context<String>;

/// Request [`Context`] where the user is not authenticated.
pub(crate) type PublicContext = Context<()>;

/// Request context.
///
/// See [`AuthContext`] and [`PublicContext`].
pub(crate) struct Context<Auth> {
    /// Read/write or read-only database connection.
    db: DbConn,
    proof_cache: Arc<ProofCache>,
    kafka_producer: FutureProducer,
    auth: Auth,
}

impl<Auth> Context<Auth> {
    /// Returns the database connection.
    pub(crate) fn db(&self) -> &DbConn {
        &self.db
    }

    /// Cache for identities proofs.
    pub(crate) fn proof_cache(&self) -> &ProofCache {
        &self.proof_cache
    }

    /// Message sending to kafka.
    pub(crate) fn kafka(&self) -> &FutureProducer {
        &self.kafka_producer
    }
}

impl PublicContext {
    /// Create a new context without authentication information.
    pub(crate) async fn new(
        pool: &DatabaseConnection,
        proof_cache: Arc<ProofCache>,
        kafka_producer: FutureProducer,
    ) -> Result<PublicContext, Status> {
        let db = DbConn::from_pool(pool).await?;

        Ok(Context {
            db,
            proof_cache,
            kafka_producer,
            auth: (),
        })
    }
}

impl AuthContext {
    /// Create a new context with authentication information.
    pub(crate) async fn new<T>(
        pool: &DatabaseConnection,
        proof_cache: Arc<ProofCache>,
        kafka_producer: FutureProducer,
        request: &tonic::Request<T>,
    ) -> Result<AuthContext, Status> {
        let auth = authenticated_identity(request).ok_or_else(|| {
            Status::unauthenticated("authentication required")
        })?;

        let ctx = PublicContext::new(pool, proof_cache, kafka_producer).await?;

        Ok(Context {
            db: ctx.db,
            proof_cache: ctx.proof_cache,
            kafka_producer: ctx.kafka_producer,
            auth,
        })
    }

    /// Returns the identity of the authenticated caller.
    pub(crate) fn identity(&self) -> &str {
        self.auth.as_str()
    }
}
