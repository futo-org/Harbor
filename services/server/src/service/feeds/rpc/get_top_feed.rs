//! `get_explore_feed`: top feed events, either global or personal.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;

use crate::service::context::ServiceContext;
use crate::service::feeds::repository::Query;
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::map_db_err;
use crate::service::proto::{GetExploreFeedRequest, GetFeedResponse};
use tonic::Status;

pub struct Params {
    pub common: feeds_pipeline::Params,
    pub identity: Option<String>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: GetExploreFeedRequest,
) -> Result<GetFeedResponse, Status> {
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
        page_info: Some(result.page_info.to_proto()?),
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<feeds_pipeline::Fetched, Status> {
    let rows = Query::list_top_feed_events(
        &ctx.db,
        params.common.limit + 1,
        /* TODO: add support for pagination.
        &params.common.cursor_filter,
        */
        params.identity.as_deref(),
    )
    .await
    .map_err(map_db_err)?;

    Ok(feeds_pipeline::finalize_fetch(rows, &params.common))
}

async fn hydrate(
    ctx: &ServiceContext,
    _: &Params,
    fetched: &feeds_pipeline::Fetched,
) -> Result<HydrationState, Status> {
    feeds_pipeline::hydrate(ctx, fetched).await
}

async fn filter(
    _ctx: &ServiceContext,
    params: &Params,
    fetched: feeds_pipeline::Fetched,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    feeds_pipeline::filter(fetched, hydration, &params.common.omit_labels).await
}

async fn view(
    ctx: &ServiceContext,
    _: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
