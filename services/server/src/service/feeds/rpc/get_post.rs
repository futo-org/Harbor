use tonic::Status;

use crate::data::hydration::{HydrationState, post_hydrate};
use crate::data::{Cursor, PageInfo, pipeline};
use crate::service::context::PublicContext;
use crate::service::feeds::repository::Query;
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::map_db_err;
use crate::service::proto::{GetPostRequest, GetPostResponse};

pub async fn handle(
    ctx: PublicContext,
    req: GetPostRequest,
) -> Result<GetPostResponse, Status> {
    let params = Params {
        identity: req.identity,
        sequence: req.sequence,
        omit_labels: req.omit_labels,
    };

    let result =
        pipeline::create_pipeline(&ctx, &params, fetch, hydrate, filter, view)
            .await?;

    Ok(GetPostResponse {
        candidates: result.event_bundles,
        event_hints: result.event_hints,
    })
}

struct Params {
    identity: String,
    sequence: u64,
    omit_labels: Vec<String>,
}

async fn fetch(
    ctx: &PublicContext,
    params: &Params,
) -> Result<feeds_pipeline::Fetched, Status> {
    let rows = Query::list_events_at_sequence(
        ctx.db(),
        &params.identity,
        params.sequence,
    )
    .await
    .map_err(map_db_err)?;

    Ok(feeds_pipeline::Fetched {
        rows,
        page_info: PageInfo {
            backward_cursor: Cursor::Start,
            forward_cursor: Cursor::End,
            has_previous_page: false,
            has_next_page: false,
        },
    })
}

async fn hydrate(
    ctx: &PublicContext,
    _: &Params,
    fetched: &feeds_pipeline::Fetched,
) -> Result<HydrationState, Status> {
    post_hydrate(ctx, &fetched.rows).await
}

async fn filter(
    _: &PublicContext,
    params: &Params,
    fetched: feeds_pipeline::Fetched,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    feeds_pipeline::filter(fetched, hydration, &params.omit_labels).await
}

async fn view(
    ctx: &PublicContext,
    _: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
