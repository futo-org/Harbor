//! `search_users`: searches users.

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::proto::{
    SearchUsersRequest, SearchUsersResponse, SortUsersBy,
};
use crate::service::search::repository::Query;
use crate::service::search::rpc::{
    self, Fetched, Marker, SearchResponseFilter, SearchResponseView,
    finalize_fetch,
};
use serde::{Deserialize, Serialize};
use tonic::Status;

struct Params {
    common: rpc::Params<SortedUsersBy>,
    sort_by: SortUsersBy,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: SearchUsersRequest,
) -> Result<SearchUsersResponse, Status> {
    let sort_by = req.sort_by();
    let common = rpc::Params::from_req_params(req.query, &req.page_params)?;
    let params = Params { common, sort_by };
    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;
    Ok(SearchUsersResponse {
        results: result.results,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.to_proto()?),
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<Fetched<SortedUsersBy>, Status> {
    let mut rows = Query::search_users(
        &ctx.db,
        &params.common.query,
        params.sort_by,
        params.common.limit,
        params.common.cursor_filter.as_ref(),
    )
    .await?;
    let page_info = finalize_fetch(&mut rows, &params.common, |row| Marker {
        sorted_by: match params.sort_by {
            SortUsersBy::Default => SortedUsersBy::Rank(row.search_rank),
            SortUsersBy::Alpha => SortedUsersBy::Name(row.profile_name.clone()),
        },
        event_id: row.event.id,
    });
    let rows = rows
        .into_iter()
        .map(|row| (row.event, row.content, row.search_rank))
        .collect();
    Ok(Fetched { rows, page_info })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SortedUsersBy {
    /// ts_rank rank returned by Postgres.
    Rank(f32),
    Name(String),
}

impl SortedUsersBy {
    pub fn matches(&self, sort_by: SortUsersBy) -> bool {
        match self {
            SortedUsersBy::Rank(_) => sort_by == SortUsersBy::Default,
            SortedUsersBy::Name(_) => sort_by == SortUsersBy::Alpha,
        }
    }
}

async fn hydrate(
    ctx: &ServiceContext,
    _: &Params,
    fetched: &Fetched<SortedUsersBy>,
) -> Result<HydrationState, Status> {
    rpc::hydrate(ctx, fetched).await
}

async fn filter(
    _: &ServiceContext,
    _: &Params,
    fetched: Fetched<SortedUsersBy>,
    hydration: &HydrationState,
) -> Result<SearchResponseFilter<SortedUsersBy>, Status> {
    let omit_labels = &[];
    rpc::filter(fetched, hydration, omit_labels).await
}

async fn view(
    ctx: &ServiceContext,
    _: &Params,
    filtered: SearchResponseFilter<SortedUsersBy>,
    hydration: HydrationState,
) -> Result<SearchResponseView<SortedUsersBy>, Status> {
    rpc::view(ctx, filtered, hydration).await
}
