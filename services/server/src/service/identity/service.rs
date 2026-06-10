//! Helpers for fetching identity-related events that hydrate
//! feed/list/thread responses. Split into per-data-source functions
//! so the pipeline's hydrate stage can fan them out in parallel.

use crate::service::context::ServiceContext;
use crate::service::feeds::repository::{
    self as FeedsRepository, EventWithContentRow,
};
use crate::service::identity::repository::Query as IdentityRepo;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, EventBundle, Identity, PublicKey, SerializedContent, SignedEvent,
};
use prost::Message;
use std::collections::HashMap;
use tonic::Status;

/// Collect every identity referenced by `rows`: each event's author
/// plus any reply-parent identity carried in a Post's content.
pub fn collect_identities(rows: &[EventWithContentRow]) -> Vec<String> {
    let mut set: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for (event, content) in rows {
        set.insert(event.identity.clone());
        if let Some(parent_identity) =
            content.as_ref().and_then(reply_parent_identity)
        {
            set.insert(parent_identity);
        }
    }
    set.into_iter().collect()
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
async fn warm_identity_cache(
    ctx: &ServiceContext,
    rows: &[EventWithContentRow],
) {
    let mut latest: HashMap<&str, (i64, Option<&[u8]>)> = HashMap::new();
    for (event, content) in rows {
        let entry = latest.entry(event.identity.as_str()).or_insert((-1, None));
        if event.sequence > entry.0 {
            entry.0 = event.sequence;
            entry.1 = content.as_ref().map(|c| c.serialized_bytes.as_slice());
        }
    }
    for (identity, (_, bytes)) in latest {
        if let Some(content) = bytes.and_then(decode_identity_content) {
            ctx.proof_cache
                .warm_identity_content(identity, content)
                .await;
        }
    }
}

fn decode_identity_content(bytes: &[u8]) -> Option<Identity> {
    let content = Content::decode(bytes).ok()?;
    match content.content_body? {
        ContentBody::Identity(i) => Some(i),
        _ => None,
    }
}

/// `(EventModel, Option<ContentModel>)` rows → `EventBundle`s with no proofs.
pub fn rows_to_bundles(rows: Vec<EventWithContentRow>) -> Vec<EventBundle> {
    rows.into_iter()
        .map(|(event, content)| EventBundle {
            signed_event: Some(SignedEvent {
                event_bytes: event.event_bytes,
                signature: event.signature,
            }),
            serialized_content: content.map(|c| SerializedContent {
                content_bytes: c.serialized_bytes,
            }),
            event_proofs: Vec::new(),
        })
        .collect()
}

/// Identity of a post content's reply-parent, if present and non-empty.
fn reply_parent_identity(
    content: &::entity::content_model::Model,
) -> Option<String> {
    let decoded = Content::decode(content.serialized_bytes.as_slice()).ok()?;
    match decoded.content_body? {
        ContentBody::Post(post) => {
            Some(post.reply?.parent?.identity).filter(|s| !s.is_empty())
        }
        _ => None,
    }
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    eprintln!("identity hints db error: {e}");
    Status::internal("internal server error")
}

/// Verify that `signer` is permitted to sign an event in
/// `(target_identity, collection)`.
///
/// TODO: share this rule set with `rs-core::client::validate_event`.
pub async fn authorize_event_signer(
    ctx: &ServiceContext,
    target_identity: &str,
    signer: &PublicKey,
    collection: i32,
    signature: &[u8],
) -> Result<(), Status> {
    let identity_content = match ctx
        .proof_cache
        .identity_content(target_identity)
        .await
    {
        Some(c) => c,
        None => {
            let loaded = IdentityRepo::latest_valid_identity_content(
                &ctx.db,
                target_identity,
            )
            .await
            .map_err(|e| {
                eprintln!("authorize_event_signer db error: {e}");
                Status::internal("internal server error")
            })?
            .ok_or_else(|| {
                Status::failed_precondition(
                    "no identity content for target — sync identity events first",
                )
            })?;
            ctx.proof_cache
                .warm_identity_content(target_identity, loaded.clone())
                .await;
            loaded
        }
    };

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

    let canonical = ctx
        .proof_cache
        .canonical(&ctx.db, target_identity, collection)
        .await
        .map_err(|e| {
            eprintln!("authorize_event_signer canonical error: {e}");
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
