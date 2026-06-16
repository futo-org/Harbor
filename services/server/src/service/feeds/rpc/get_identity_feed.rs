//! `get_identity_feed`: posts authored by a specific identity,
//! newest first.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::feeds::repository::{FeedCursor, Query as FeedsRepository};
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::{PageCursor, map_db_err, page_limit};
use crate::service::proto::{GetFeedResponse, GetIdentityFeedRequest};
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
    let common = feeds_pipeline::Params {
        limit: page_limit(&req.page_params),
        backward_token: req
            .page_params
            .as_ref()
            .and_then(|params| params.backward_token.as_ref())
            .map(|token| FeedCursor::decode(token))
            .transpose()?,
        forward_token: req
            .page_params
            .as_ref()
            .and_then(|params| params.forward_token.as_ref())
            .map(|token| FeedCursor::decode(token))
            .transpose()?,
    };

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
        // Tokens need to be swapped because the feed is sorted reverse chronologically
        params.common.forward_token.clone(),
        params.common.backward_token.clone(),
    )
    .await
    .map_err(map_db_err)?;

    Ok(feeds_pipeline::finalize_fetch(rows, &params.common))
}

#[allow(clippy::ptr_arg)] // signature must match pipeline's HRTB (&Fetched = &Vec<…>)
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
