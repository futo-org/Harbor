use crate::{
    data::pipeline,
    service::{
        context::ServiceContext,
        events::TargetEventKey,
        feeds::{repository::Query as FeedsRepository, util::map_db_err},
        identity::service::{
            list_identity_events, list_profile_events, rows_to_bundles,
        },
        notifications::repository::Query as NotificationRepository,
        proofs::service::attach_proofs,
        proto::{
            EventBundle, EventHint, EventKey, ListNotificationsRequest,
            ListNotificationsResponse, Notification, PageInfo, PublicKey,
        },
        stats::service::{gather_stats_for, include_stats},
    },
};
use ::entity::notification;
use std::collections::{HashMap, HashSet};
use tonic::Status;

const DEFAULT_LIMIT: u32 = 50;
const MAX_LIMIT: u32 = 200;
struct Params {
    identity: String,
    limit: u64,
    after_id: Option<i64>,
    omit_labels: Vec<String>,
}

pub struct Fetched {
    pub rows: Vec<notification::Model>,
    pub has_next_page: bool,
    pub has_previous_page: bool,
}

struct Hydrated {
    bundles: HashMap<TargetEventKey, EventBundle>,
    /// Identity, profile, and moderation label events for every identity involved.
    event_hints: Vec<EventHint>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: ListNotificationsRequest,
) -> Result<ListNotificationsResponse, Status> {
    if req.identity.is_empty() {
        return Err(Status::invalid_argument("identity is required"));
    }

    // The cursor is the stringified id of the last notification from the
    // previous page.
    let after_id = match req.after.as_deref() {
        None | Some("") => None,
        Some(cursor) => Some(
            cursor
                .parse::<i64>()
                .map_err(|_| Status::invalid_argument("invalid cursor"))?,
        ),
    };

    let limit = req.first.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT) as u64;

    let params = Params {
        identity: req.identity,
        limit,
        after_id,
        omit_labels: req.omit_labels,
    };

    pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view).await
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Fetched, Status> {
    let raw = NotificationRepository::list_for_identity(
        &ctx.db,
        &params.identity,
        params.limit + 1, // over-fetch for pagination
        params.after_id,
        &params.omit_labels,
        ctx.trusted_moderator.as_deref(),
    )
    .await
    .map_err(map_db_err)?;

    let has_next_page = raw.len() > params.limit as usize;
    let rows: Vec<notification::Model> =
        raw.into_iter().take(params.limit as usize).collect();

    Ok(Fetched {
        rows,
        has_next_page,
        has_previous_page: params.after_id.is_some(),
    })
}

async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    fetched: &Fetched,
) -> Result<Hydrated, Status> {
    let rows = &fetched.rows;
    // Every trigger (and present target) event the page references, plus the
    // identities involved.
    let mut cmp_keys: Vec<TargetEventKey> = Vec::new();
    let mut trigger_keys: Vec<TargetEventKey> = Vec::new();
    let mut identities: HashSet<String> = HashSet::new();
    for row in rows {
        let trigger_key = trigger_key(row);
        trigger_keys.push(trigger_key.clone());
        cmp_keys.push(trigger_key);
        if let Some(target) = target_key(row) {
            cmp_keys.push(target);
        }
        identities.insert(row.from_identity.clone());
        identities.insert(row.to_identity.clone());
    }

    // Bulk-fetch the referenced events, build bundles with proofs, and index
    // them by their comparable key for the view stage.
    let proto_keys: Vec<EventKey> = cmp_keys.iter().map(to_proto_key).collect();
    let fetched = FeedsRepository::list_events_by_keys(&ctx.db, &proto_keys)
        .await
        .map_err(map_db_err)?;
    let fetched_keys: Vec<TargetEventKey> =
        fetched.iter().map(|(e, _)| TargetEventKey::of(e)).collect();
    let mut fetched_bundles = rows_to_bundles(fetched);
    attach_proofs(ctx, &mut fetched_bundles).await?;

    let mut bundles: HashMap<TargetEventKey, EventBundle> =
        fetched_keys.iter().cloned().zip(fetched_bundles).collect();

    let stats_fut = async {
        gather_stats_for(&ctx.db, &fetched_keys)
            .await
            .map_err(map_db_err)
    };

    // Fetch label events for trigger events only: we assume recipient is the target's
    // author and does not object to their own posts.
    let label_fut = async {
        FeedsRepository::list_labels_for_event_keys(
            &ctx.db,
            &trigger_keys,
            ctx.trusted_moderator.as_deref(),
        )
        .await
        .map_err(map_db_err)
    };

    // Add moderation service identity to every request, such that clients can verify label events.
    // This ships the identity events more times than the client needs, and even when labels aren't
    // present in the feed page--can be optimized later.
    if let Some(moderator) = &ctx.trusted_moderator
        && !identities.is_empty()
    {
        identities.insert(moderator.clone());
    }

    let identities: Vec<String> = identities.into_iter().collect();

    // Author identity, profile, and moderation label events all ship as hints.
    let (identity_events, profile_events, label_rows, stats) = tokio::try_join!(
        list_identity_events(ctx, identities.clone()),
        list_profile_events(ctx, identities),
        label_fut,
        stats_fut
    )?;

    let mut label_bundles = rows_to_bundles(label_rows);
    attach_proofs(ctx, &mut label_bundles).await?;

    let mut event_hints: Vec<EventHint> = rows_to_bundles(
        identity_events.into_iter().chain(profile_events).collect(),
    )
    .into_iter()
    .map(|event_bundle| EventHint {
        event_bundle: Some(event_bundle),
    })
    .collect();
    event_hints.extend(label_bundles.into_iter().map(|b| EventHint {
        event_bundle: Some(b),
    }));

    for (key, bundle) in bundles.iter_mut() {
        include_stats(&mut bundle.meta, key, &stats);
    }

    Ok(Hydrated {
        bundles,
        event_hints,
    })
}

/// No filtering. `omit_labels` is enforced in `fetch`.
async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    fetched: Fetched,
    _hydrated: &Hydrated,
) -> Result<Fetched, Status> {
    Ok(fetched)
}

async fn view(
    _ctx: &ServiceContext,
    _params: &Params,
    fetched: Fetched,
    hydrated: Hydrated,
) -> Result<ListNotificationsResponse, Status> {
    let Fetched {
        rows,
        has_next_page,
        has_previous_page,
    } = fetched;
    let Hydrated {
        bundles,
        event_hints,
    } = hydrated;
    let start_cursor =
        rows.first().map(|r| r.id.to_string()).unwrap_or_default();
    let end_cursor = rows.last().map(|r| r.id.to_string()).unwrap_or_default();

    let notifications = rows
        .into_iter()
        .filter_map(|row| {
            // Drop a notification whose trigger event we can no longer
            // resolve (e.g. it was deleted).
            let trigger_event = Some(bundles.get(&trigger_key(&row)).cloned()?);
            let target_event =
                target_key(&row).and_then(|key| bundles.get(&key).cloned());
            Some(Notification {
                trigger_event,
                target_event,
                kind: row.kind,
            })
        })
        .collect();

    Ok(ListNotificationsResponse {
        notifications,
        event_hints,
        page_info: Some(PageInfo {
            start_cursor,
            end_cursor,
            has_next_page,
            has_previous_page,
        }),
    })
}

/// The trigger event's comparable key (always present).
fn trigger_key(row: &notification::Model) -> TargetEventKey {
    TargetEventKey {
        collection: row.trigger_event_key_collection,
        identity: row.trigger_event_key_identity.clone(),
        public_key_type: row.trigger_event_key_public_key_type,
        public_key: row.trigger_event_key_public_key.clone(),
        sequence: row.trigger_event_key_sequence,
    }
}

/// The target event's comparable key, or `None` for notifications without a
/// target event (follows store an empty key).
fn target_key(row: &notification::Model) -> Option<TargetEventKey> {
    if row.target_event_key_identity.is_empty() {
        return None;
    }
    Some(TargetEventKey {
        collection: row.target_event_key_collection,
        identity: row.target_event_key_identity.clone(),
        public_key_type: row.target_event_key_public_key_type,
        public_key: row.target_event_key_public_key.clone(),
        sequence: row.target_event_key_sequence,
    })
}

/// Convert a comparable key into the proto `EventKey` used to fetch events.
fn to_proto_key(key: &TargetEventKey) -> EventKey {
    EventKey {
        collection: key.collection as i32,
        identity: key.identity.clone(),
        signed_by: Some(PublicKey {
            key_type: key.public_key_type as i32,
            key: key.public_key.clone(),
        }),
        sequence: key.sequence as u64,
    }
}
