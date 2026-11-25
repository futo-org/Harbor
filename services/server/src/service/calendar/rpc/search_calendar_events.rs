//! `search_calendar_events`: search calendar events

use tonic::Status;

use crate::data::filter;
use crate::data::pipeline::{self, Fetched, finalize_fetch};
use crate::data::{
    CursorFilter, EventWithContentRow, Marker, PaginationParams,
};
use crate::service::calendar::repository::{Query as Repository, SearchRank};
use crate::service::context::PublicContext;
use crate::service::proto::{
    SearchCalendarEventsRequest, SearchCalendarEventsResponse,
};

use super::common;

struct Params {
    query: String,
    limit: u32,
    cursor_filter: CursorFilter<SearchRank>,
}

pub async fn handle(
    mut ctx: PublicContext,
    req: SearchCalendarEventsRequest,
) -> Result<SearchCalendarEventsResponse, Status> {
    let query = req.query.trim();
    if query.is_empty() {
        return Err(Status::invalid_argument("empty search query"));
    }
    let PaginationParams {
        cursor_filter,
        limit,
    } = PaginationParams::from_req_params(req.page_params.as_ref())?;
    let params = Params {
        query: query.to_owned(),
        limit,
        cursor_filter,
    };

    let result = pipeline::create_pipeline(
        &mut ctx,
        &params,
        fetch,
        common::hydrate,
        filter::deleted_or_blocked,
        common::view,
    )
    .await?;
    Ok(SearchCalendarEventsResponse {
        events: result.events,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.to_proto()?),
    })
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<Fetched<EventWithContentRow, SearchRank>, Status> {
    let mut rows = Repository::search_events(
        &mut ctx.db,
        &params.query,
        u64::from(params.limit) + 1, // For pagination.
        &params.cursor_filter,
    )
    .await?;
    let page_info =
        finalize_fetch(&mut rows, &params.cursor_filter, params.limit, |row| {
            Marker {
                sorted_by: row.sorted_by,
                event_id: row.event.id,
            }
        });
    let rows = rows
        .into_iter()
        .map(|row| (row.event, Some(row.content)))
        .collect();
    Ok(Fetched { rows, page_info })
}

#[cfg(test)]
mod tests {
    use tonic::Code;

    use crate::service::calendar::rpc::common::tests::ctx_without_rows;

    use super::*;

    #[tokio::test]
    async fn rejects_empty_query() {
        let result = handle(
            ctx_without_rows().await,
            SearchCalendarEventsRequest {
                query: "  ".to_owned(),
                page_params: None,
            },
        )
        .await;
        assert_eq!(result.unwrap_err().code(), Code::InvalidArgument);
    }
}
