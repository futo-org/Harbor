use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use tonic::Status;

use super::repository::Query;
use crate::service::context::ServiceContext;

#[derive(Default)]
pub struct BlockCache {
    /// blocking identity mapped to blocked identities
    blocked: RwLock<HashMap<String, Arc<HashSet<String>>>>,
}

impl BlockCache {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// For the identity provided, get a list of all identities that the identity
    /// blocks.
    pub async fn blocked_set(
        &self,
        ctx: &ServiceContext,
        identity: &str,
    ) -> Result<Arc<HashSet<String>>, Status> {
        if let Some(cached) = self.blocked.read().await.get(identity).cloned() {
            return Ok(cached);
        }

        let fetched: Arc<HashSet<String>> = Arc::new(
            Query::list_blocked_identities(ctx, identity)
                .await?
                .into_iter()
                .collect(),
        );

        self.blocked
            .write()
            .await
            .insert(identity.to_string(), Arc::clone(&fetched));

        Ok(fetched)
    }

    /// Drop the cached blocklist for `identity`.
    pub async fn invalidate_identity(&self, identity: &str) {
        self.blocked.write().await.remove(identity);
    }
}
