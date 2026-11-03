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

    /// Create a public request context with read-only database access.
    pub(crate) async fn public_ro<T>(
        &self,
        request: &tonic::Request<T>,
    ) -> Result<PublicContext, Status> {
        let auth = authenticated_identity(request);
        RequestContext::new(
            &self.ro_db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            auth.map(Identity),
        )
        .await
    }

    /// Create a public request context with read-write database access.
    pub(crate) async fn public_rw<T>(
        &self,
        request: &tonic::Request<T>,
    ) -> Result<PublicContext, Status> {
        let auth = authenticated_identity(request);
        RequestContext::new(
            &self.db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            auth.map(Identity),
        )
        .await
    }

    /// Create an authenticated request context with read-only database access.
    pub(crate) async fn authenticted_ro<T>(
        &self,
        request: &tonic::Request<T>,
    ) -> Result<AuthContext, Status> {
        let auth = authenticated_identity(request).ok_or_else(auth_error)?;
        RequestContext::new(
            &self.db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            Identity(auth),
        )
        .await
    }

    /// Create an authenticated request context with read-write database access.
    pub(crate) async fn authenticted_rw<T>(
        &self,
        request: &tonic::Request<T>,
    ) -> Result<AuthContext, Status> {
        let auth = authenticated_identity(request).ok_or_else(auth_error)?;
        RequestContext::new(
            &self.db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            Identity(auth),
        )
        .await
    }

    /// Create a worker request context with read-write database access.
    pub(crate) async fn worker_rw(&self) -> Result<WorkerContext, Status> {
        RequestContext::new(
            &self.db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            (), // No auth information.
        )
        .await
    }

    #[cfg(test)]
    pub(crate) async fn test_public(&self, identity: &str) -> PublicContext {
        RequestContext::new(
            &self.db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            Some(Identity(identity.into())),
        )
        .await
        .unwrap()
    }

    #[cfg(test)]
    pub(crate) async fn test_auth(&self, identity: &str) -> AuthContext {
        RequestContext::new(
            &self.db,
            self.proof_cache.clone(),
            self.kafka_producer.clone(),
            Identity(identity.into()),
        )
        .await
        .unwrap()
    }
}

fn auth_error() -> Status {
    Status::unauthenticated("authentication required")
}

/// [`RequestContext`] where the user is optionally authenticated.
pub(crate) type PublicContext = RequestContext<Option<Identity>>;

/// [`RequestContext`] where the user is authenticated.
pub(crate) type AuthContext = RequestContext<Identity>;

/// Authenticated with an identity.
#[derive(Debug)]
pub(crate) struct Identity(String);

impl std::ops::Deref for Identity {
    type Target = str;

    fn deref(&self) -> &str {
        self.0.deref()
    }
}

/// [`RequestContext`] for a worker.
pub(crate) type WorkerContext = RequestContext<()>;

/// Request context.
///
/// See [`AuthContext`], [`PublicContext`] and [`WorkerContext`]. Request
/// context can be created from a [`ServiceContext`].
pub(crate) struct RequestContext<Auth> {
    /// Read/write or read-only database connection.
    pub(crate) db: DbConn,
    /// Cache for identities proofs.
    pub(crate) proof_cache: Arc<ProofCache>,
    /// Message sending to kafka.
    pub(crate) kafka_producer: FutureProducer,
    /// Authentication information, see [`Auth`].
    pub(crate) auth: Auth,
}

impl<Auth> RequestContext<Auth> {
    async fn new(
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

/// Authentication of a context.
///
/// This provides optional autentication, when authentication is required use
/// [`AuthContext`].
pub(crate) trait Auth {
    /// Returns the identity of the authenticated caller, if the caller is
    /// authenticated.
    fn identity(&self) -> Option<&str>;
}

impl Auth for Option<Identity> {
    fn identity(&self) -> Option<&str> {
        self.as_deref()
    }
}

impl Auth for Identity {
    fn identity(&self) -> Option<&str> {
        Some(self.0.as_str())
    }
}

/// No authentication.
impl Auth for () {
    fn identity(&self) -> Option<&str> {
        None
    }
}
