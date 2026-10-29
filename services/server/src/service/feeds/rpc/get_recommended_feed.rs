//! `get_recommended_feed`: posts with which identities the caller follows has
//! interacted (plus the caller's own interactions).

use tonic::Status;

use crate::data::hydration::{HydrationState, post_hydrate};
use crate::data::{Marker, pipeline};
use crate::service::context::PublicContext;
use crate::service::feeds::repository::{Query as FeedsRepository, SortedBy};
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, Fetched, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::proto::{
    GetFeedResponse, GetFollowingFeedRequest, SortPostsBy,
};

pub struct Params {
    pub common: feeds_pipeline::Params<SortedBy>,
    pub sort_by: SortPostsBy,
    pub identity: String,
}

pub async fn handle(
    mut ctx: PublicContext,
    req: GetFollowingFeedRequest,
) -> Result<GetFeedResponse, Status> {
    // TODO: move this to use AuthContext.
    if req.follower_identity.is_empty() {
        return Err(Status::invalid_argument("follower_identity is required"));
    }

    let sort_by = req.sort_by();
    let common = feeds_pipeline::Params::from_req_params(
        &req.page_params,
        req.omit_labels,
    )?;
    let params = Params {
        common,
        sort_by,
        identity: req.follower_identity,
    };

    let result = pipeline::create_pipeline(
        &mut ctx, &params, fetch, hydrate, filter, view,
    )
    .await?;
    Ok(GetFeedResponse {
        event_bundles: result.event_bundles,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.to_proto()?),
    })
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<feeds_pipeline::Fetched<SortedBy>, Status> {
    let mut rows = FeedsRepository::recommended_feed(
        &ctx.db,
        &params.identity,
        params.sort_by,
        params.common.limit + 1, // For pagination.
        &params.common.cursor_filter,
    )
    .await?;

    let page_info = pipeline::finalize_fetch(
        &mut rows,
        &params.common.cursor_filter,
        params.common.limit as u32,
        |row| {
            let sorted_by = match params.sort_by {
                SortPostsBy::Default | SortPostsBy::Latest => {
                    SortedBy::CreatedAt(row.event.created_at)
                }
                SortPostsBy::Top => {
                    SortedBy::ReactionCount(row.reactions.clone())
                }
            };
            Marker {
                sorted_by,
                event_id: row.event.id,
            }
        },
    );
    let rows = rows
        .into_iter()
        .map(|row| (row.event, Some(row.content)))
        .collect();
    Ok(Fetched { rows, page_info })
}

async fn hydrate(
    ctx: &mut PublicContext,
    _: &Params,
    fetched: &feeds_pipeline::Fetched<SortedBy>,
) -> Result<HydrationState, Status> {
    post_hydrate(ctx, &fetched.rows).await
}

async fn filter(
    _: &mut PublicContext,
    params: &Params,
    fetched: feeds_pipeline::Fetched<SortedBy>,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter<SortedBy>, Status> {
    feeds_pipeline::filter(fetched, hydration, &params.common.omit_labels).await
}

async fn view(
    ctx: &mut PublicContext,
    _: &Params,
    filtered: GetFeedResponseFilter<SortedBy>,
    hydration: HydrationState,
) -> Result<GetFeedResponseView<SortedBy>, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
