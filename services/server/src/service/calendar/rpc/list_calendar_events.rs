//! `list_calendar_events`: list calendar events

use sea_orm::prelude::DateTimeWithTimeZone;
use tonic::Status;

use crate::data::filter;
use crate::data::pipeline::{self, Fetched, finalize_fetch};
use crate::data::{
    CursorFilter, EventWithContentRow, Marker, PaginationParams,
};
use crate::service::calendar::repository::{
    EventsFilter, Query as Repository, StartAt,
};
use crate::service::context::PublicContext;
use crate::service::proto::{
    ListCalendarEventsRequest, ListCalendarEventsResponse,
};
use crate::util::db::timestamp_from_millis;

use super::common;

struct Params {
    identity: Option<String>,
    awaiting_host: Option<String>,
    ends_after: Option<DateTimeWithTimeZone>,
    ends_before: Option<DateTimeWithTimeZone>,
    latest_first: bool,
    limit: u32,
    cursor_filter: CursorFilter<StartAt>,
}

pub async fn handle(
    mut ctx: PublicContext,
    req: ListCalendarEventsRequest,
) -> Result<ListCalendarEventsResponse, Status> {
    let filters = req.filters.unwrap_or_default();
    let PaginationParams {
        cursor_filter,
        limit,
    } = PaginationParams::from_req_params(req.page_params.as_ref())?;
    let params = Params {
        identity: filters.identity.filter(|identity| !identity.is_empty()),
        awaiting_host: filters
            .awaiting_host
            .filter(|identity| !identity.is_empty()),
        ends_after: filters.ends_after.map(timestamp).transpose()?,
        ends_before: filters.ends_before.map(timestamp).transpose()?,
        latest_first: req.latest_first,
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
    Ok(ListCalendarEventsResponse {
        events: result.events,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.to_proto()?),
    })
}

fn timestamp(millis: u64) -> Result<DateTimeWithTimeZone, Status> {
    timestamp_from_millis(millis)
        .ok_or_else(|| Status::invalid_argument("timestamp out of range"))
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<Fetched<EventWithContentRow, StartAt>, Status> {
    let mut rows = Repository::list_events(
        &mut ctx.db,
        &EventsFilter {
            created_or_hosted_by: params.identity.as_deref(),
            awaiting_host: params.awaiting_host.as_deref(),
            ends_after: params.ends_after,
            ends_before: params.ends_before,
        },
        params.latest_first,
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
