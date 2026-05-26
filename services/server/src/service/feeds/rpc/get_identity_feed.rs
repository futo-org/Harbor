//! `get_identity_feed`: posts authored by a specific identity,
//! newest first.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::tombstone::EventWithContentRow;
use crate::service::feeds::repository::Query as FeedsRepository;
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::{map_db_err, page_limit};
use crate::service::proto::{GetFeedResponse, GetIdentityFeedRequest};
use tonic::Status;

pub struct Params {
    pub identity: String,
    pub limit: u64,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: GetIdentityFeedRequest,
) -> Result<GetFeedResponse, Status> {
    if req.identity.is_empty() {
        return Err(Status::invalid_argument("identity is required"));
    }
    let params = Params {
        identity: req.identity,
        limit: page_limit(&req.page_params),
    };

    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;

    Ok(GetFeedResponse {
        event_bundles: result.event_bundles,
        event_hints: result.event_hints,
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Vec<EventWithContentRow>, Status> {
    FeedsRepository::list_feed_events_by_identities(
        &ctx.db,
        vec![params.identity.clone()],
        params.limit,
    )
    .await
    .map_err(map_db_err)
}

#[allow(clippy::ptr_arg)] // signature must match pipeline's HRTB (&Fetched = &Vec<…>)
async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    rows: &Vec<EventWithContentRow>,
) -> Result<HydrationState, Status> {
    feeds_pipeline::hydrate(ctx, rows).await
}

async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    rows: Vec<EventWithContentRow>,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    feeds_pipeline::filter(rows, hydration).await
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
