//! `list_events`: raw filtered listing of events. Returns every row
//! the query produced, **including tombstoned ones** — callers
//! (sync clients, debug tools) need the unfiltered stream.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::repository::Query as EventsRepository;
use crate::service::events::tombstone::EventWithContentRow;
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
    rows_to_bundles,
};
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{
    EventHint, EventKey, ListEventsRequest, ListEventsResponse, PublicKey,
};
use polycentric_common::models::protos_v2::EventBundle;
use tonic::Status;

#[derive(Default)]
pub struct Filtered {
    pub live_rows: Vec<EventWithContentRow>,
}

#[derive(Default)]
pub struct View {
    pub event_bundles: Vec<EventBundle>,
    pub event_hints: Vec<EventHint>,
}

pub struct Params {
    pub size: u64,
    pub collection: Option<i32>,
    pub identity: Option<String>,
    pub signed_by: Option<PublicKey>,
    pub sequence_gt: Option<i64>,
    pub sequence_lt: Option<i64>,
    pub heads: Vec<EventKey>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: ListEventsRequest,
) -> Result<ListEventsResponse, Status> {
    let size = req.size.unwrap_or(200).min(200) as u64;
    let filters = req.filters.unwrap_or_default();
    let params = Params {
        size,
        collection: filters.collection,
        identity: filters.identity,
        signed_by: filters.signed_by,
        sequence_gt: filters.sequence_gt,
        sequence_lt: filters.sequence_lt,
        heads: filters.heads,
    };

    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;

    Ok(ListEventsResponse {
        event_bundles: result.event_bundles,
        event_hints: result.event_hints,
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Vec<EventWithContentRow>, Status> {
    EventsRepository::list_events(
        &ctx.db,
        Some(params.size),
        params.collection,
        params.identity.clone(),
        params.signed_by.clone(),
        params.sequence_gt,
        params.sequence_lt,
        params.heads.clone(),
    )
    .await
    .map_err(|e| {
        eprintln!("list_events db error: {e}");
        Status::internal("internal server error")
    })
}

#[allow(clippy::ptr_arg)] // signature must match pipeline's HRTB (&Fetched = &Vec<…>)
async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    rows: &Vec<EventWithContentRow>,
) -> Result<HydrationState, Status> {
    let identities = collect_identities(rows);
    let (identity_events, profile_events) = tokio::try_join!(
        list_identity_events(ctx, identities.clone()),
        list_profile_events(ctx, identities),
    )?;
    Ok(HydrationState {
        identity_events,
        profile_events,
        ..Default::default()
    })
}

async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    rows: Vec<EventWithContentRow>,
    _hydration: &HydrationState,
) -> Result<Filtered, Status> {
    Ok(Filtered { live_rows: rows })
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: Filtered,
    hydration: HydrationState,
) -> Result<View, Status> {
    let Filtered { live_rows, .. } = filtered;
    let HydrationState {
        identity_events,
        profile_events,
        ..
    } = hydration;

    let mut event_bundles = rows_to_bundles(live_rows);
    attach_proofs(ctx, &mut event_bundles).await?;

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

    Ok(View {
        event_bundles,
        event_hints,
    })
}
