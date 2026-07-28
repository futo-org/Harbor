//! `get_identity_feed`: posts authored by a specific identity,
//! newest first.

use crate::{
    data::{hydration::HydrationState, pipeline},
    service::{
        context::ServiceContext,
        feeds::{
            repository::Query as FeedsRepository,
            rpc::common::{
                self as feeds_pipeline, GetFeedResponseFilter,
                GetFeedResponseView,
            },
            util::map_db_err,
        },
        proto::{GetFeedResponse, GetIdentityFeedRequest},
    },
};
use tonic::Status;

pub struct Params {
    pub common: feeds_pipeline::Params,
    pub identity: String,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: GetIdentityFeedRequest,
) -> Result<GetFeedResponse, Status> {
    if req.identity.is_empty() {
        return Err(Status::invalid_argument("identity is required"));
    }

    let common = feeds_pipeline::Params::from_req_params(
        &req.page_params,
        req.omit_labels,
    )?;
    let params = Params {
        common,
        identity: req.identity,
    };

    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;
    Ok(GetFeedResponse {
        event_bundles: result.event_bundles,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.proto()?),
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<feeds_pipeline::Fetched, Status> {
    let rows = FeedsRepository::list_feed_events_by_identities(
        &ctx.db,
        vec![params.identity.clone()],
        params.common.limit + 1, // Check for next page
        &params.common.cursor_filter,
    )
    .await
    .map_err(map_db_err)?;
    Ok(feeds_pipeline::finalize_fetch(rows, &params.common))
}

async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    fetched: &feeds_pipeline::Fetched,
) -> Result<HydrationState, Status> {
    feeds_pipeline::hydrate(ctx, fetched).await
}

async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    fetched: feeds_pipeline::Fetched,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    feeds_pipeline::filter(fetched, hydration, &_params.common.omit_labels)
        .await
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
