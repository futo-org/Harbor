//! `search_posts`: searches posts.

use crate::data::hydration::HydrationState;
use crate::data::pipeline::{create_pipeline, finalize_fetch};
use crate::service::context::ServiceContext;
use crate::service::proto::{
    SearchPostsRequest, SearchPostsResponse, SortPostsBy,
};
use crate::service::search::repository::Query;
use crate::service::search::rpc::{
    self, Fetched, Marker, SearchResponseFilter, SearchResponseView,
};
use sea_orm::prelude::DateTimeWithTimeZone;
use serde::{Deserialize, Serialize};
use tonic::Status;

struct Params {
    common: rpc::Params<SortedPostsBy>,
    sort_by: SortPostsBy,
    omit_labels: Vec<String>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: SearchPostsRequest,
) -> Result<SearchPostsResponse, Status> {
    let sort_by = req.sort_by();

    // TODO: implemented this. Alos remove the unreachable call from fetch.
    if sort_by == SortPostsBy::Top {
        return Err(Status::unimplemented(
            "ordering by top is not implemented",
        ));
    }

    let common = rpc::Params::from_req_params(req.query, &req.page_params)?;
    let params = Params {
        common,
        sort_by,
        omit_labels: req.omit_labels,
    };
    let result =
        create_pipeline(ctx, &params, fetch, hydrate, filter, view).await?;
    Ok(SearchPostsResponse {
        results: result.results,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.to_proto()?),
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Fetched<SortedPostsBy>, Status> {
    let mut rows = Query::search_posts(
        &ctx.db,
        &params.common.query,
        params.sort_by,
        params.common.limit,
        params.common.cursor_filter.as_ref(),
    )
    .await?;
    let page_info = finalize_fetch(
        &mut rows,
        params.common.cursor_filter.as_ref(),
        params.common.limit as u32,
        |row| Marker {
            sorted_by: match params.sort_by {
                SortPostsBy::Default => SortedPostsBy::Rank(row.search_rank),
                // Checked in handle above.
                SortPostsBy::Top => unimplemented!(),
                SortPostsBy::Latest => {
                    SortedPostsBy::Latest(row.content.synced_at)
                }
            },
            event_id: row.event.id,
        },
    );
    let rows = rows
        .into_iter()
        .map(|row| (row.event, row.content, row.search_rank))
        .collect();
    Ok(Fetched { rows, page_info })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SortedPostsBy {
    /// ts_rank rank returned by Postgres.
    Rank(f32),
    Latest(DateTimeWithTimeZone),
}

impl SortedPostsBy {
    pub fn matches(&self, sort_by: SortPostsBy) -> bool {
        match self {
            SortedPostsBy::Rank(_) => sort_by == SortPostsBy::Default,
            SortedPostsBy::Latest(_) => sort_by == SortPostsBy::Latest,
        }
    }
}

async fn hydrate(
    ctx: &ServiceContext,
    _: &Params,
    fetched: &Fetched<SortedPostsBy>,
) -> Result<HydrationState, Status> {
    rpc::hydrate(ctx, fetched).await
}

async fn filter(
    _: &ServiceContext,
    params: &Params,
    fetched: Fetched<SortedPostsBy>,
    hydration: &HydrationState,
) -> Result<SearchResponseFilter<SortedPostsBy>, Status> {
    rpc::filter(fetched, hydration, &params.omit_labels).await
}

async fn view(
    ctx: &ServiceContext,
    _: &Params,
    filtered: SearchResponseFilter<SortedPostsBy>,
    hydration: HydrationState,
) -> Result<SearchResponseView<SortedPostsBy>, Status> {
    rpc::view(ctx, filtered, hydration).await
}
