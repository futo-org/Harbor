//! Helpers for fetching identity-related events that hydrate
//! feed/list/thread responses. Split into per-data-source functions
//! so the pipeline's hydrate stage can fan them out in parallel.

use crate::data::EventWithContentRow;
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::context::ServiceContext;
use crate::service::feeds::repository::{self as FeedsRepository};
use crate::service::identity::chain;
use crate::service::identity::repository::{
    Erased, EventsSelector, Mutation as IdentityMutation, Query as IdentityRepo,
};
use crate::service::proofs::cache::ProofCache;
use crate::service::proto::{ContentDigest, PublicKey};
use polycentric_common::models::collections;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbErr, TransactionTrait};
use std::collections::HashMap;
use tonic::Status;

const ALL_COLLECTIONS: [i32; 8] = [
    collections::IDENTITY,
    collections::FEED,
    collections::PROFILE,
    collections::INTERACTIONS,
    collections::SOCIAL_GRAPH,
    collections::REPORTS,
    collections::LABELS,
    collections::VERIFICATIONS,
];

/// Erases matching events, deletes blobs nothing references any more, and
/// drops cached chain state. Used by bans and the operator command.
pub async fn erase_events(
    db: &DatabaseConnection,
    filestore: Option<&ContentFilestore>,
    proof_cache: Option<&ProofCache>,
    selector: &EventsSelector<'_>,
) -> Result<Erased, DbErr> {
    let txn = db.begin().await?;
    let erased = IdentityMutation::erase_events(&txn, selector).await?;
    txn.commit().await?;

    delete_blobs(filestore, &erased.blobs).await;
    if let Some(cache) = proof_cache {
        for identity in &erased.identities {
            cache.invalidate_identity(identity).await;
            for collection in ALL_COLLECTIONS {
                cache.invalidate_canonical(identity, collection).await;
            }
        }
    }
    Ok(erased)
}

/// Deletes content rows no event references, and their blob bodies.
pub async fn prune_content(
    db: &DatabaseConnection,
    filestore: Option<&ContentFilestore>,
) -> Result<Erased, DbErr> {
    let txn = db.begin().await?;
    let pruned = IdentityMutation::prune_orphan_content(&txn).await?;
    txn.commit().await?;

    delete_blobs(filestore, &pruned.blobs).await;
    Ok(pruned)
}

async fn delete_blobs(
    filestore: Option<&ContentFilestore>,
    blobs: &[ContentDigest],
) {
    let Some(filestore) = filestore else { return };
    for digest in blobs {
        if let Err(error) = filestore.delete_blob(digest).await {
            tracing::warn!(
                %error,
                digest = hex::encode(&digest.value),
                "failed to delete blob"
            );
        }
    }
}

/// The identity-chain and profile events for `identities`. Fetched
/// sequentially so MockDatabase-backed tests stay deterministic; skips the
/// lookups entirely for an empty list.
pub async fn list_identity_and_profile_events(
    ctx: &ServiceContext,
    identities: Vec<String>,
) -> Result<(Vec<EventWithContentRow>, Vec<EventWithContentRow>), Status> {
    if identities.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let identity_events = list_identity_events(ctx, identities.clone()).await?;
    let profile_events = list_profile_events(ctx, identities).await?;
    Ok((identity_events, profile_events))
}

/// Fetch the latest identity events (rotation/signing key chain) for
/// each identity in `identities`, and warm the proof cache from
/// whichever Identity content payload is freshest per identity.
pub async fn list_identity_events(
    ctx: &ServiceContext,
    identities: Vec<String>,
) -> Result<Vec<EventWithContentRow>, Status> {
    let rows = IdentityRepo::list_identity_events_for_identities(
        &ctx.ro_db, identities,
    )
    .await
    .map_err(map_db_err)?;
    warm_identity_cache(ctx, &rows).await;
    Ok(rows)
}

/// Fetch the latest profile event (display name, avatar, banner)
/// for each identity in `identities`.
pub async fn list_profile_events(
    ctx: &ServiceContext,
    identities: Vec<String>,
) -> Result<Vec<EventWithContentRow>, Status> {
    FeedsRepository::Query::list_latest_profiles_for_identities(
        &ctx.ro_db, identities,
    )
    .await
    .map_err(map_db_err)
}

/// Pass our the identity events through to the proof cache
/// probably a better place for this
///
/// `rows` from `list_identity_events_for_identities` are an identity's
/// complete IDENTITY-collection chain, so each identity's chain is
/// validated in memory (no extra queries) and only the validated head is
/// cached. Caching raw events instead would let a forged, unauthorized
/// IDENTITY event poison the cache and impersonate the identity for
/// everything that reads it (auth, event-write authorization, proofs).
async fn warm_identity_cache(
    ctx: &ServiceContext,
    rows: &[EventWithContentRow],
) {
    let mut by_identity: HashMap<&str, Vec<&EventWithContentRow>> =
        HashMap::new();
    for row in rows {
        by_identity
            .entry(row.0.identity.as_str())
            .or_default()
            .push(row);
    }
    for (identity, identity_rows) in by_identity {
        if let Some(content) =
            chain::validated_chain_head(identity, identity_rows)
        {
            ctx.proof_cache
                .warm_identity_content(identity, content)
                .await;
        }
    }
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    tracing::error!(error = %e, "identity hints db error");
    Status::internal("internal server error")
}

/// The latest valid identity document for `identity`, via the proof cache.
pub async fn cached_identity_content<C: ConnectionTrait>(
    db: &C,
    proof_cache: &ProofCache,
    identity: &str,
) -> Result<polycentric_common::models::protos_v2::Identity, Status> {
    if let Some(content) = proof_cache.identity_content(identity).await {
        return Ok(content);
    }
    let loaded = IdentityRepo::latest_valid_identity_content(db, identity)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "identity content db error");
            Status::internal("internal server error")
        })?
        .ok_or_else(|| {
            Status::failed_precondition(
                "no identity content for target — sync identity events first",
            )
        })?;
    proof_cache
        .warm_identity_content(identity, loaded.clone())
        .await;
    Ok(loaded)
}

/// Verify that `signer` is permitted to sign an event in
/// `(target_identity, collection)`.
///
/// TODO: share this rule set with `rs-core::client::validate_event`.
pub async fn authorize_event_signer<C: ConnectionTrait>(
    db: &C,
    proof_cache: &ProofCache,
    target_identity: &str,
    signer: &PublicKey,
    collection: i32,
    signature: &[u8],
) -> Result<(), Status> {
    let identity_content =
        cached_identity_content(db, proof_cache, target_identity).await?;

    if identity_content.authorizes_signer(signer) {
        return Ok(());
    }

    let target = identity_content
        .revocation_target_for(signer, collection)
        .ok_or_else(|| {
            Status::permission_denied(
                "signer is revoked or not authorized by target identity",
            )
        })?;

    let canonical =
        proof_cache
        .canonical(db, target_identity, collection)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "authorize_event_signer canonical error");
            Status::internal("internal server error")
        })?;

    let leaf_count = target.leaf_count as usize;
    if canonical.len() < leaf_count
        || !canonical[..leaf_count]
            .iter()
            .any(|s| s.as_slice() == signature)
    {
        return Err(Status::permission_denied(
            "signer revoked and signature is not within the committed bound",
        ));
    }

    Ok(())
}
