//! List claims (VERIFICATIONS events) for an identity, excluding deleted
//! ones. Runs its own pipeline rather than `list_events`, which keeps
//! tombstoned rows.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::repository::Query as EventsRepository;
use crate::service::events::tombstone::{self, EventWithContentRow};
use crate::service::identity::service::rows_to_bundles;
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{ListClaimsRequest, ListClaimsResponse};
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::EventBundle;
use tonic::Status;

struct Params {
    identity: String,
}

#[derive(Default)]
struct Filtered {
    live_rows: Vec<EventWithContentRow>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: ListClaimsRequest,
) -> Result<ListClaimsResponse, Status> {
    let params = Params {
        identity: req.claimed_by_identity,
    };

    let event_bundles =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;

    Ok(ListClaimsResponse { event_bundles })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Vec<EventWithContentRow>, Status> {
    EventsRepository::list_events(
        &ctx.db,
        None,
        Some(collections::VERIFICATIONS),
        Some(params.identity.clone()),
        None,
        None,
        None,
        Vec::new(),
    )
    .await
    .map_err(|e| {
        eprintln!("list_claims db error: {e}");
        Status::internal("internal server error")
    })
}

#[allow(clippy::ptr_arg)] // signature must match pipeline's HRTB (&Fetched = &Vec<…>)
async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    rows: &Vec<EventWithContentRow>,
) -> Result<HydrationState, Status> {
    let keys: Vec<TargetEventKey> =
        rows.iter().map(|(e, _)| TargetEventKey::of(e)).collect();

    let raw = tombstone::list_tombstones_for_event_keys(&ctx.db, &keys)
        .await
        .map_err(|e| {
            eprintln!("list_claims tombstone db error: {e}");
            Status::internal("internal server error")
        })?;
    let deletes_by_target = tombstone::validate_tombstones(ctx, raw).await?;

    Ok(HydrationState {
        deletes_by_target,
        ..Default::default()
    })
}

async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    rows: Vec<EventWithContentRow>,
    hydration: &HydrationState,
) -> Result<Filtered, Status> {
    let live_rows = rows
        .into_iter()
        .filter(|row| {
            !hydration
                .deletes_by_target
                .contains_key(&TargetEventKey::of(&row.0))
        })
        .collect();
    Ok(Filtered { live_rows })
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: Filtered,
    _hydration: HydrationState,
) -> Result<Vec<EventBundle>, Status> {
    let mut event_bundles = rows_to_bundles(filtered.live_rows);
    attach_proofs(ctx, &mut event_bundles).await?;
    Ok(event_bundles)
}
