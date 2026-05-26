//! `get_following_feed`: posts from identities the caller follows
//! (plus the caller's own posts), newest first.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::tombstone::EventWithContentRow;
use crate::service::feeds::repository::Query as FeedsRepository;
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::{map_db_err, page_limit};
use crate::service::graph::repository as GraphRepository;
use crate::service::proto::{GetFeedResponse, GetFollowingFeedRequest};
use tonic::Status;

pub struct Params {
    pub identities: Vec<String>,
    pub limit: u64,
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

    let params = Params {
        identities,
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
        params.identities.clone(),
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
