//! Common functions for feed rpc requests
//! Mostly pipeline related

use crate::data::hydration::HydrationState;
use crate::service::context::ServiceContext;
use crate::service::events::tombstone::{
    self as tombstone, DeleteTargetEventKey, EventWithContentRow,
};
use crate::service::feeds::util::map_db_err;
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
    rows_to_bundles,
};
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{EventBundle, EventHint};
use tonic::Status;

#[derive(Default)]
pub struct GetFeedResponseFilter {
    pub live_rows: Vec<EventWithContentRow>,
    pub tombstone_bundles: Vec<EventBundle>,
}

#[derive(Default)]
pub struct GetFeedResponseView {
    pub event_bundles: Vec<EventBundle>,
    pub event_hints: Vec<EventHint>,
}

/// Return relevant content such as:
/// - tombstones for the queried rows
/// - latest identity events (rotation/signing chain) for every
///   identity referenced
/// - latest profile event (display name / avatar / banner) for every
///   identity referenced
pub async fn hydrate(
    ctx: &ServiceContext,
    rows: &[EventWithContentRow],
) -> Result<HydrationState, Status> {
    let keys: Vec<DeleteTargetEventKey> = rows
        .iter()
        .map(|(e, _)| DeleteTargetEventKey::of(e))
        .collect();
    let identities = collect_identities(rows);

    // Returns valid (as far as the server is concerned) tombstones related to queried events
    let tombstones_fut = async {
        let raw = tombstone::list_tombstones_for_event_keys(&ctx.db, &keys)
            .await
            .map_err(map_db_err)?;
        tombstone::validate_tombstones(ctx, raw).await
    };
    let identity_events_fut = list_identity_events(ctx, identities.clone());
    let profile_events_fut = list_profile_events(ctx, identities);

    let (deletes_by_target, identity_events, profile_events) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
    )?;

    Ok(HydrationState {
        deletes_by_target,
        identity_events,
        profile_events,
    })
}

/// Remove all rows that have been marked as deleted.
pub async fn filter(
    rows: Vec<EventWithContentRow>,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    let mut live_rows: Vec<EventWithContentRow> =
        Vec::with_capacity(rows.len());
    let mut tombstone_bundles: Vec<EventBundle> = Vec::new();
    for row in rows {
        let key = DeleteTargetEventKey::of(&row.0);
        if let Some(bundles) = hydration.deletes_by_target.get(&key) {
            tombstone_bundles.extend(bundles.iter().cloned());
        } else {
            live_rows.push(row);
        }
    }
    Ok(GetFeedResponseFilter {
        live_rows,
        tombstone_bundles,
    })
}

/// Build bundles from live rows, attach revocation proofs, and merge
/// identity, profile and tombstone hints.
pub async fn view(
    ctx: &ServiceContext,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    let GetFeedResponseFilter {
        live_rows,
        mut tombstone_bundles,
    } = filtered;
    let HydrationState {
        identity_events,
        profile_events,
        ..
    } = hydration;

    let mut event_bundles = rows_to_bundles(live_rows);
    tokio::try_join!(
        attach_proofs(ctx, &mut event_bundles),
        attach_proofs(ctx, &mut tombstone_bundles),
    )?;

    let mut event_hints: Vec<EventHint> = Vec::new();
    event_hints.extend(rows_to_bundles(identity_events).into_iter().map(|b| {
        EventHint {
            event_bundle: Some(b),
        }
    }));
    event_hints.extend(rows_to_bundles(profile_events).into_iter().map(|b| {
        EventHint {
            event_bundle: Some(b),
        }
    }));
    event_hints.extend(tombstone_bundles.into_iter().map(|b| EventHint {
        event_bundle: Some(b),
    }));

    Ok(GetFeedResponseView {
        event_bundles,
        event_hints,
    })
}
