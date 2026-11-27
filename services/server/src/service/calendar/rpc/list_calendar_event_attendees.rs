//! `list_calendar_event_attendees`: RSVPs for a calendar event

use tonic::Status;

use crate::data::filter::{self, Filtered};
use crate::data::hydration::HydrationState;
use crate::data::pipeline::{self, Fetched, finalize_fetch};
use crate::data::{
    CursorFilter, EventWithContentRow, Marker, PaginationParams,
    assemble_bundles,
};
use crate::service::calendar::repository::Query as Repository;
use crate::service::context::PublicContext;
use crate::service::events::TargetEventKey;
use crate::service::feeds::repository::EventCreatedAt;
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{
    CalendarEventRsvpStatus, ListCalendarEventAttendeesRequest,
    ListCalendarEventAttendeesResponse,
};

use super::common;

struct Params {
    target: TargetEventKey,
    status: Option<CalendarEventRsvpStatus>,
    limit: u32,
    cursor_filter: CursorFilter<EventCreatedAt>,
}

pub async fn handle(
    mut ctx: PublicContext,
    req: ListCalendarEventAttendeesRequest,
) -> Result<ListCalendarEventAttendeesResponse, Status> {
    let status = match req.status {
        None => None,
        Some(status) => match CalendarEventRsvpStatus::try_from(status) {
            Ok(CalendarEventRsvpStatus::Unspecified) | Err(_) => {
                return Err(Status::invalid_argument("status is not known"));
            }
            Ok(status) => Some(status),
        },
    };
    let PaginationParams {
        cursor_filter,
        limit,
    } = PaginationParams::from_req_params(req.page_params.as_ref())?;
    let params = Params {
        target: common::calendar_event_key(req.event_key, "event_key")?,
        status,
        limit,
        cursor_filter,
    };

    pipeline::create_pipeline(
        &mut ctx,
        &params,
        fetch,
        common::hydrate,
        filter::deleted_or_blocked,
        view,
    )
    .await
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<Fetched<EventWithContentRow, EventCreatedAt>, Status> {
    let mut rows = Repository::list_rsvps(
        &mut ctx.db,
        &params.target,
        params.status,
        u64::from(params.limit) + 1, // For pagination.
        &params.cursor_filter,
    )
    .await?;
    let page_info = finalize_fetch(
        &mut rows,
        &params.cursor_filter,
        params.limit,
        |(event, _)| Marker {
            sorted_by: event.created_at,
            event_id: event.id,
        },
    );
    Ok(Fetched { rows, page_info })
}

async fn view(
    ctx: &mut PublicContext,
    _: &Params,
    filtered: Filtered<EventWithContentRow, EventCreatedAt>,
    hydration: HydrationState,
) -> Result<ListCalendarEventAttendeesResponse, Status> {
    let mut event_bundles = assemble_bundles(filtered.rows, &hydration.stats);
    attach_proofs(ctx, &mut event_bundles).await?;
    Ok(ListCalendarEventAttendeesResponse {
        event_bundles,
        event_hints: hydration.into_hints(),
        page_info: Some(filtered.page_info.to_proto()?),
    })
}

#[cfg(test)]
mod tests {
    use polycentric_common::models::collections;
    use tonic::Code;

    use crate::service::calendar::rpc::common::tests::{
        ctx_without_rows, event_key,
    };

    use super::*;

    #[tokio::test]
    async fn rejects_unknown_status() {
        for status in [CalendarEventRsvpStatus::Unspecified as i32, 99] {
            let result = handle(
                ctx_without_rows().await,
                ListCalendarEventAttendeesRequest {
                    event_key: Some(event_key(collections::CALENDAR)),
                    status: Some(status),
                    page_params: None,
                },
            )
            .await;
            assert_eq!(result.unwrap_err().code(), Code::InvalidArgument);
        }
    }
}
