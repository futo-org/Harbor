use std::collections::{HashMap, HashSet};

use ::entity::notification;
use tonic::Status;

use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::feeds::repository::Query as FeedsRepository;
use crate::service::feeds::util::map_db_err;
use crate::service::identity::service::{
    list_identity_events, list_profile_events, rows_to_bundles,
};
use crate::service::notifications::repository::Query as NotificationRepository;
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{
    EventBundle, EventHint, EventKey, ListNotificationsRequest,
    ListNotificationsResponse, Notification, PageInfo, PublicKey,
};

const DEFAULT_LIMIT: u32 = 50;
const MAX_LIMIT: u32 = 200;

struct Params {
    identity: String,
    limit: u64,
    after_id: Option<i64>,
}

struct Hydrated {
    /// Trigger/target events, indexed by their comparable key so each
    /// notification row can look up the bundles it references.
    bundles: HashMap<TargetEventKey, EventBundle>,
    /// Identity + profile events for every identity involved.
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
    };

    pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view).await
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Vec<notification::Model>, Status> {
    let rows = NotificationRepository::list_for_identity(
        &ctx.db,
        &params.identity,
        params.limit,
        params.after_id,
    )
    .await
    .map_err(map_db_err)?;
    // TEMP DEBUG: what did sea-orm actually read for `kind`?
    eprintln!(
        "[list_notifications] identity={} kinds={:?}",
        params.identity,
        rows.iter().map(|r| (r.id, r.kind)).collect::<Vec<_>>()
    );
    Ok(rows)
}

#[allow(clippy::ptr_arg)] // signature must match pipeline's HRTB (&Fetched = &Vec<…>)
async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    rows: &Vec<notification::Model>,
) -> Result<Hydrated, Status> {
    // Every trigger (and present target) event the page references, plus the
    // identities involved.
    let mut cmp_keys: Vec<TargetEventKey> = Vec::new();
    let mut identities: HashSet<String> = HashSet::new();
    for row in rows {
        cmp_keys.push(trigger_key(row));
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
    let bundles: HashMap<TargetEventKey, EventBundle> =
        fetched_keys.into_iter().zip(fetched_bundles).collect();

    // Author identity (signing chain) + profile (name/avatar) events as hints.
    let identities: Vec<String> = identities.into_iter().collect();
    let (identity_events, profile_events) = tokio::try_join!(
        list_identity_events(ctx, identities.clone()),
        list_profile_events(ctx, identities),
    )?;
    let event_hints: Vec<EventHint> = rows_to_bundles(
        identity_events.into_iter().chain(profile_events).collect(),
    )
    .into_iter()
    .map(|event_bundle| EventHint {
        event_bundle: Some(event_bundle),
    })
    .collect();

    Ok(Hydrated {
        bundles,
        event_hints,
    })
}

// Notifications carry no per-row state to filter (no tombstones); pass through.
async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    rows: Vec<notification::Model>,
    _hydrated: &Hydrated,
) -> Result<Vec<notification::Model>, Status> {
    Ok(rows)
}

async fn view(
    _ctx: &ServiceContext,
    params: &Params,
    rows: Vec<notification::Model>,
    hydrated: Hydrated,
) -> Result<ListNotificationsResponse, Status> {
    let Hydrated {
        bundles,
        event_hints,
    } = hydrated;

    // A full page implies there may be more; cursors page off the row ids.
    let has_next_page = rows.len() as u64 == params.limit;
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
            has_previous_page: params.after_id.is_some(),
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
