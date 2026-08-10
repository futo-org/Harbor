//! Helpers for fetching identity-related events that hydrate
//! feed/list/thread responses. Split into per-data-source functions
//! so the pipeline's hydrate stage can fan them out in parallel.

use crate::service::context::ServiceContext;
use crate::service::feeds::repository::{
    self as FeedsRepository, EventWithContentRow,
};
use crate::service::identity::chain;
use crate::service::identity::repository::Query as IdentityRepo;
use crate::service::proofs::cache::ProofCache;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, EventBundle, EventHint, PublicKey, SerializedContent, SignedEvent,
};
use prost::Message;
use sea_orm::ConnectionTrait;
use std::collections::HashMap;
use tonic::Status;

/// Collect every identity referenced by the rows: each event's author
/// plus any identities its content names (a Post's reply parent, a
/// Follow's target, a VerificationTarget's requested verifiers).
pub fn collect_identities<'a>(
    rows: impl IntoIterator<
        Item = (
            &'a ::entity::event_model::Model,
            Option<&'a ::entity::content_model::Model>,
        ),
    >,
) -> Vec<String> {
    let mut set: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for (event, content) in rows {
        set.insert(event.identity.clone());
        if let Some(content) = content {
            content_identities(content, &mut set);
        }
    }
    set.into_iter().collect()
}

/// Identities named inside a content body, added to `out`.
fn content_identities(
    content: &::entity::content_model::Model,
    out: &mut std::collections::HashSet<String>,
) {
    let Ok(decoded) = Content::decode(content.serialized_bytes.as_slice())
    else {
        return;
    };
    match decoded.content_body {
        Some(ContentBody::Post(post)) => {
            if let Some(identity) =
                post.reply.and_then(|r| r.parent).map(|p| p.identity)
                && !identity.is_empty()
            {
                out.insert(identity);
            }
        }
        Some(ContentBody::Follow(follow)) => {
            if !follow.identity.is_empty() {
                out.insert(follow.identity);
            }
        }
        Some(ContentBody::VerificationTarget(target)) => {
            out.extend(
                target
                    .target_identities
                    .into_iter()
                    .filter(|identity| !identity.is_empty()),
            );
        }
        _ => {}
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
    let rows =
        IdentityRepo::list_identity_events_for_identities(&ctx.db, identities)
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
        &ctx.db, identities,
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

/// `(EventModel, Option<ContentModel>)` rows → `EventBundle`s with no proofs.
pub fn rows_to_bundles(rows: Vec<EventWithContentRow>) -> Vec<EventBundle> {
    rows.into_iter().map(row_to_bundle).collect()
}

pub fn row_to_bundle(row: EventWithContentRow) -> EventBundle {
    let (event, content) = row;
    EventBundle {
        signed_event: Some(SignedEvent {
            event_bytes: event.event_bytes,
            signature: event.signature,
        }),
        serialized_content: content.map(|c| SerializedContent {
            content_bytes: c.serialized_bytes,
        }),
        event_proofs: Vec::new(),
        meta: None,
    }
}

/// Wrap bundles as `EventHint`s.
pub fn bundles_to_hints(bundles: Vec<EventBundle>) -> Vec<EventHint> {
    bundles
        .into_iter()
        .map(|event_bundle| EventHint {
            event_bundle: Some(event_bundle),
        })
        .collect()
}

/// Bundle rows wrapped as `EventHint`s.
pub fn rows_to_hints(rows: Vec<EventWithContentRow>) -> Vec<EventHint> {
    bundles_to_hints(rows_to_bundles(rows))
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

    let bound = identity_content
        .revocation_bounds
        .iter()
        .find(|rb| {
            rb.revoked_key
                .as_ref()
                .map(|pk| {
                    pk.key_type == signer.key_type && pk.key == signer.key
                })
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            Status::permission_denied(
                "signer is not authorized by target identity",
            )
        })?;

    let target = bound
        .targets
        .iter()
        .find(|t| t.collection == collection)
        .ok_or_else(|| {
            Status::permission_denied(
                "signer revoked with no target for this collection",
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
