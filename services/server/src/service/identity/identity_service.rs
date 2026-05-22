//! Shared helpers for building identity-related hints attached to
//! feed/list/thread responses.

use crate::service::context::ServiceContext;
use crate::service::feeds::feeds_repository::{
    self as FeedsRepository, FeedRow,
};
use crate::service::identity::identity_repository::Query as IdentityRepo;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, EventBundle, EventHint, Identity, SerializedContent, SignedEvent,
};
use prost::Message;
use std::collections::HashMap;
use tonic::Status;

/// Build the identity content and profile event hints that are relevant to return rows
pub async fn build_identity_hints(
    ctx: &ServiceContext,
    rows: &[FeedRow],
) -> Result<Vec<EventHint>, Status> {
    let mut identities: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for (event, content) in rows {
        identities.insert(event.identity.clone());
        if let Some(parent_identity) =
            content.as_ref().and_then(reply_parent_identity)
        {
            identities.insert(parent_identity);
        }
    }
    let identities: Vec<String> = identities.into_iter().collect();

    // Fetch the identity events: TODO. We can cache these aggressively
    let identity_rows = IdentityRepo::list_identity_events_for_identities(
        &ctx.db,
        identities.clone(),
    )
    .await
    .map_err(map_db_err)?;

    // Warm up the identity cache (helps proofs)
    warm_identity_cache(ctx, &identity_rows).await;

    // Fetch the profile events: TODO. We can cache these even more aggressively!
    let profile_rows =
        FeedsRepository::Query::list_latest_profiles_for_identities(
            &ctx.db, identities,
        )
        .await
        .map_err(map_db_err)?;

    let mut hints: Vec<EventHint> =
        Vec::with_capacity(identity_rows.len() + profile_rows.len());
    hints.extend(rows_to_bundles(identity_rows).into_iter().map(|b| {
        EventHint {
            event_bundle: Some(b),
        }
    }));
    hints.extend(rows_to_bundles(profile_rows).into_iter().map(|b| {
        EventHint {
            event_bundle: Some(b),
        }
    }));
    Ok(hints)
}

/// Pass our the identity events through to the proof cache
/// probably a better place for this
async fn warm_identity_cache(ctx: &ServiceContext, rows: &[FeedRow]) {
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
pub fn rows_to_bundles(rows: Vec<FeedRow>) -> Vec<EventBundle> {
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
