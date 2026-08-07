//! Shared cache for EventProof generation. Persists across requests;
//! `put_events` invalidates affected entries.
//!
//! The identity-content side is populated externally (typically by
//! `build_identity_hints` decoding the rows it already fetched). The
//! cache never queries the DB for identity content on its own.

use polycentric_common::models::protos_v2::Identity;
use sea_orm::{ConnectionTrait, DbErr};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::repository;

/// One entry per `(identity, collection)` — the canonical-ordered
/// signatures used to rebuild trees for proof generation.
type CanonicalSignatures = HashMap<(String, i32), Vec<Vec<u8>>>;

#[derive(Default)]
pub struct ProofCache {
    /// identity → latest `Identity` content.
    identity: RwLock<HashMap<String, Identity>>,
    /// (identity, collection) → canonical leaf signatures.
    canonical: RwLock<CanonicalSignatures>,
}

impl ProofCache {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Read the cached `Identity` content for `identity`. Returns `None`
    /// when nothing's been warmed for this identity (no DB fallback).
    pub async fn identity_content(&self, identity: &str) -> Option<Identity> {
        self.identity.read().await.get(identity).cloned()
    }

    /// Canonical signatures for `(identity, collection)`. Cached after the first hit.
    pub async fn canonical<C: ConnectionTrait>(
        &self,
        db: &C,
        identity: &str,
        collection: i32,
    ) -> Result<Vec<Vec<u8>>, DbErr> {
        let key = (identity.to_string(), collection);
        if let Some(cached) = self.canonical.read().await.get(&key).cloned() {
            return Ok(cached);
        }
        let fetched =
            repository::canonical_signatures(db, identity, collection).await?;
        self.canonical.write().await.insert(key, fetched.clone());
        Ok(fetched)
    }

    /// Insert pre-decoded identity content into the cache.
    pub async fn warm_identity_content(
        &self,
        identity: &str,
        content: Identity,
    ) {
        self.identity
            .write()
            .await
            .insert(identity.to_string(), content);
    }

    /// Drop the cached canonical signatures for `(identity, collection)`.
    /// Call after writes to that stream.
    pub async fn invalidate_canonical(&self, identity: &str, collection: i32) {
        self.canonical
            .write()
            .await
            .remove(&(identity.to_string(), collection));
    }

    /// Drop the cached identity content for `identity`. Call after writes
    /// to the IDENTITY collection.
    pub async fn invalidate_identity(&self, identity: &str) {
        self.identity.write().await.remove(identity);
    }
}
