//! `get_following_feed`: posts from identities the caller follows
//! (plus the caller's own posts), newest first.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::feeds::repository::Query as FeedsRepository;
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::map_db_err;
use crate::service::graph::repository as GraphRepository;
use crate::service::proto::{GetFeedResponse, GetFollowingFeedRequest};
use tonic::Status;

pub struct Params {
    pub common: feeds_pipeline::Params,
    pub identities: Vec<String>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: GetFollowingFeedRequest,
) -> Result<GetFeedResponse, Status> {
    if req.follower_identity.is_empty() {
        return Err(Status::invalid_argument("follower_identity is required"));
    }
    let caller = req.follower_identity;

    let mut identities =
        GraphRepository::Query::list_followed_identities(ctx, &caller).await?;

    // Include the caller's own posts in their following feed.
    if !identities.iter().any(|a| a == &caller) {
        identities.push(caller);
    }

    let common = feeds_pipeline::Params::from_req_params(&req.page_params)?;
    let params = Params { common, identities };

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
        params.identities.clone(),
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
    feeds_pipeline::filter(fetched, hydration).await
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
