//! `get_calendar_event`: a calendar event with its stats

use tonic::Status;

use crate::data::filter;
use crate::data::pipeline::{self, Fetched};
use crate::data::{Cursor, EventWithContentRow, PageInfo};
use crate::service::calendar::repository::{Query as Repository, StartAt};
use crate::service::context::PublicContext;
use crate::service::events::TargetEventKey;
use crate::service::proto::{
    GetCalendarEventRequest, GetCalendarEventResponse,
};

use super::common;

struct Params {
    key: TargetEventKey,
}

pub async fn handle(
    mut ctx: PublicContext,
    req: GetCalendarEventRequest,
) -> Result<GetCalendarEventResponse, Status> {
    let params = Params {
        key: common::calendar_event_key(req.event_key, "event_key")?,
    };

    let mut result = pipeline::create_pipeline(
        &mut ctx,
        &params,
        fetch,
        common::hydrate,
        filter::deleted_or_blocked,
        common::view,
    )
    .await?;
    // Missing, deleted or from a blocked identity
    let event = result
        .events
        .pop()
        .ok_or_else(|| Status::not_found("calendar event not found"))?;
    Ok(GetCalendarEventResponse {
        event: Some(event),
        event_hints: result.event_hints,
    })
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<Fetched<EventWithContentRow, StartAt>, Status> {
    let row = Repository::find_event(&mut ctx.db, &params.key).await?;
    Ok(Fetched {
        rows: row
            .into_iter()
            .map(|row| (row.event, Some(row.content)))
            .collect(),
        page_info: PageInfo {
            backward_cursor: Cursor::Start,
            forward_cursor: Cursor::End,
            has_previous_page: false,
            has_next_page: false,
        },
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
    async fn rejects_key_outside_calendar_collection() {
        let result = handle(
            ctx_without_rows().await,
            GetCalendarEventRequest {
                event_key: Some(event_key(collections::FEED)),
            },
        )
        .await;
        assert_eq!(result.unwrap_err().code(), Code::InvalidArgument);
    }
}
