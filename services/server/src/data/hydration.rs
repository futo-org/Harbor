use crate::data::EventRow;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{self, EventWithContentRow};
use crate::service::feeds::repository::{self as feeds_repository};
use crate::service::feeds::rpc::common::{
    to_target_event_key, to_target_event_keys,
};
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
};
use crate::service::stats::service::{EventStats, gather_stats_for};
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::{
    Content, EventBundle, EventHint, EventKey,
};
use prost::Message;
use std::collections::{HashMap, HashSet};
use tonic::Status;

#[derive(Default)]
pub struct HydrationState {
    pub deletes_by_target: HashMap<TargetEventKey, Vec<EventBundle>>,
    pub identity_events: Vec<EventWithContentRow>,
    pub profile_events: Vec<EventWithContentRow>,
    pub quote_post_events: Vec<EventWithContentRow>,
    pub repost_events: Vec<EventWithContentRow>,
    pub stats: EventStats,
    pub label_events: Vec<EventWithContentRow>,
}

impl HydrationState {
    /// The hydrated identity-chain and profile rows as `EventHint`s, so
    /// clients can validate and render the referenced identities without
    /// extra queries.
    pub fn identity_profile_hints(self) -> Vec<EventHint> {
        crate::service::identity::service::rows_to_hints(
            self.identity_events
                .into_iter()
                .chain(self.profile_events)
                .collect(),
        )
    }
}

/// Return relevant content such as:
/// * Tombstones for the queried rows.
/// * Latest identity events (rotation/signing chain) for every identity
///   referenced.
/// * Latest profile event (display name / avatar / banner) for every identity
///   referenced.
pub async fn hydrate<Row>(
    ctx: &ServiceContext,
    rows: &[Row],
) -> Result<HydrationState, Status>
where
    Row: EventRow,
{
    let keys: Vec<TargetEventKey> = rows
        .iter()
        .map(|row| TargetEventKey::of(row.as_event()))
        .collect();
    let mut identities =
        collect_identities(rows.iter().map(Row::as_event_with_content));
    let (ref_keys, quote_set, repost_set) = collect_referenced_keys(rows);
    let mut target_event_keys = to_target_event_keys(&ref_keys);

    // Add moderation service identity to every request, such that clients can
    // verify label events. This ships the identity events more times than the
    // client needs, and even when labels aren't present in the feed page -- can
    // be optimized later.
    if let Some(moderator) = &ctx.trusted_moderator
        && !identities.is_empty()
    {
        identities.push(moderator.clone())
    }

    // Event keys for all referenced post events that may be displayed by the client.
    // Fetch labels and additional metadata for these.
    let display_keys: Vec<TargetEventKey> = {
        target_event_keys.extend(keys);
        target_event_keys.into_iter().collect()
    };

    let tombstones_fut = tombstone::validated_tombstones(ctx, &display_keys);
    let identity_events_fut = list_identity_events(ctx, identities.clone());
    let profile_events_fut = list_profile_events(ctx, identities);
    let referenced_fut = async {
        feeds_repository::Query::list_events_by_keys(&ctx.db, &ref_keys)
            .await
            .map_err(|err| {
                tracing::error!(error = %err, "failed to list events");
                Status::internal("internal server error")
            })
    };
    let labels_fut = async {
        feeds_repository::Query::list_labels_for_event_keys(
            &ctx.db,
            &display_keys,
            ctx.trusted_moderator.as_deref(),
        )
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "failed to list labels");
            Status::internal("internal server error")
        })
    };
    let stats_fut = async {
        gather_stats_for(&ctx.db, &display_keys)
            .await
            .map_err(|err| {
                tracing::error!(error = %err, "failed to gather stats");
                Status::internal("internal server error")
            })
    };
    let (
        deletes_by_target,
        identity_events,
        profile_events,
        referenced,
        label_events,
        stats,
    ) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
        referenced_fut,
        labels_fut,
        stats_fut,
    )?;

    let mut quote_post_events = Vec::new();
    let mut repost_events = Vec::new();
    for row in referenced {
        let key = TargetEventKey::of(&row.0);
        if quote_set.contains(&key) {
            quote_post_events.push(row);
        } else if repost_set.contains(&key) {
            repost_events.push(row);
        }
    }

    Ok(HydrationState {
        deletes_by_target,
        identity_events,
        profile_events,
        quote_post_events,
        repost_events,
        label_events,
        stats,
    })
}

/// Returns all event keys references in `rows`, as well as a set for the
/// quoutes and reposts.
fn collect_referenced_keys<Row>(
    rows: &[Row],
) -> (
    Vec<EventKey>,
    HashSet<TargetEventKey>, // Quotes.
    HashSet<TargetEventKey>, // Reposts.
)
where
    Row: EventRow,
{
    let mut keys = Vec::with_capacity(rows.len());
    let mut push_key = |maybe_key: Option<EventKey>| {
        if let Some(key) = maybe_key {
            keys.push(key);
        }
    };
    let mut quote_set = HashSet::new();
    let mut repost_set = HashSet::new();
    for content in rows.iter().filter_map(EventRow::as_content) {
        let Ok(decoded) = Content::decode(content.serialized_bytes.as_slice())
        else {
            continue;
        };
        match decoded.content_body {
            Some(ContentBody::Post(post)) => {
                if let Some(key) = post.quote.as_ref()
                    && let Some(key) = to_target_event_key(key)
                {
                    quote_set.insert(key);
                }
                push_key(post.quote);
            }
            Some(ContentBody::Delete(delete)) => {
                push_key(delete.event_key);
            }
            Some(ContentBody::Reaction(reaction)) => {
                push_key(reaction.event_key);
            }
            Some(ContentBody::Repost(repost)) => {
                if let Some(key) = repost.post.as_ref()
                    && let Some(key) = to_target_event_key(key)
                {
                    repost_set.insert(key);
                }
                push_key(repost.post);
            }
            Some(ContentBody::Report(report)) => {
                push_key(report.event_key);
            }
            Some(ContentBody::Labels(labels)) => {
                push_key(labels.event_key);
            }
            Some(ContentBody::VerificationVerify(verify)) => {
                push_key(verify.claim_event_key);
            }
            Some(ContentBody::VerificationTarget(target)) => {
                push_key(target.claim_event_key);
            }
            // Don't have event keys.
            Some(ContentBody::Follow(_))
            | Some(ContentBody::Block(_))
            | Some(ContentBody::ProfileUpdate(_))
            | Some(ContentBody::Identity(_))
            | Some(ContentBody::VerificationClaim(_))
            | None => {}
        }
    }
    (keys, quote_set, repost_set)
}
