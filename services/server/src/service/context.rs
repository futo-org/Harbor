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
}

/// [`RequestContext`] where the user is optionally authenticated.
pub(crate) type PublicContext = RequestContext<Option<String>>;

/// [`RequestContext`] where the user is authenticated.
pub(crate) type AuthContext = RequestContext<String>;

/// [`RequestContext`] for a worker.
pub(crate) type WorkerContext = RequestContext<()>;

/// Request context.
///
/// See [`AuthContext`] and [`PublicContext`].
pub(crate) struct RequestContext<Auth> {
    /// Read/write or read-only database connection.
    pub(crate) db: DbConn,
    /// Cache for identities proofs.
    pub(crate) proof_cache: Arc<ProofCache>,
    /// Message sending to kafka.
    pub(crate) kafka_producer: FutureProducer,
    pub(crate) auth: Auth,
}

impl<Auth> RequestContext<Auth> {
    /// Use [`PublicContext::new`] or [`AuthContext::new`] instead.
    async fn with_auth(
        pool: &DatabaseConnection,
        proof_cache: Arc<ProofCache>,
        kafka_producer: FutureProducer,
        auth: Auth,
    ) -> Result<RequestContext<Auth>, Status> {
        let db = DbConn::from_pool(pool).await?;
        Ok(RequestContext {
            db,
            proof_cache,
            kafka_producer,
            auth,
        })
    }
}

impl PublicContext {
    /// Create a new context with optional authentication information.
    pub(crate) async fn new<T>(
        pool: &DatabaseConnection,
        proof_cache: Arc<ProofCache>,
        kafka_producer: FutureProducer,
        request: &tonic::Request<T>,
    ) -> Result<PublicContext, Status> {
        let auth = authenticated_identity(request);
        RequestContext::with_auth(pool, proof_cache, kafka_producer, auth).await
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
        RequestContext::with_auth(pool, proof_cache, kafka_producer, auth).await
    }

    /// Returns the identity of the authenticated caller.
    pub(crate) fn identity(&self) -> &str {
        self.auth.as_str()
    }
}

impl WorkerContext {
    /// Create a new context for a worker (no authentication).
    pub(crate) async fn new(
        pool: &DatabaseConnection,
        proof_cache: Arc<ProofCache>,
        kafka_producer: FutureProducer,
    ) -> Result<WorkerContext, Status> {
        RequestContext::with_auth(pool, proof_cache, kafka_producer, ()).await
    }
}

/// Authentication of a context.
///
/// This provides optional autentication, when authentication is required use
/// [`AuthContext`].
pub(crate) trait Auth {
    /// Returns the identity of the authenticated caller, if the caller is
    /// authenticated.
    fn identity(&self) -> Option<&str>;
}

impl Auth for PublicContext {
    fn identity(&self) -> Option<&str> {
        self.auth.as_deref()
    }
}

impl Auth for AuthContext {
    fn identity(&self) -> Option<&str> {
        Some(self.identity())
    }
}

impl Auth for WorkerContext {
    fn identity(&self) -> Option<&str> {
        None
    }
}
