//! gRPC `CalendarService`

use std::sync::Arc;

use tonic::{Request, Response, Status};

use crate::service::context::ServiceContext;
use crate::service::proto::calendar_service_server::{
    CalendarService, CalendarServiceServer,
};
use crate::service::proto::{
    GetCalendarEventRequest, GetCalendarEventResponse,
    ListCalendarEventAttendeesRequest, ListCalendarEventAttendeesResponse,
    ListCalendarEventsRequest, ListCalendarEventsResponse,
    SearchCalendarEventsRequest, SearchCalendarEventsResponse,
};

pub mod common;
pub mod get_calendar_event;
pub mod list_calendar_event_attendees;
pub mod list_calendar_events;
pub mod search_calendar_events;

pub struct CalendarServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl CalendarService for CalendarServiceImpl {
    async fn list_calendar_events(
        &self,
        request: Request<ListCalendarEventsRequest>,
    ) -> Result<Response<ListCalendarEventsResponse>, Status> {
        let ctx = self.ctx.public_ro(&request).await?;
        Ok(Response::new(
            list_calendar_events::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn get_calendar_event(
        &self,
        request: Request<GetCalendarEventRequest>,
    ) -> Result<Response<GetCalendarEventResponse>, Status> {
        let ctx = self.ctx.public_ro(&request).await?;
        Ok(Response::new(
            get_calendar_event::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn list_calendar_event_attendees(
        &self,
        request: Request<ListCalendarEventAttendeesRequest>,
    ) -> Result<Response<ListCalendarEventAttendeesResponse>, Status> {
        let ctx = self.ctx.public_ro(&request).await?;
        Ok(Response::new(
            list_calendar_event_attendees::handle(ctx, request.into_inner())
                .await?,
        ))
    }

    async fn search_calendar_events(
        &self,
        request: Request<SearchCalendarEventsRequest>,
    ) -> Result<Response<SearchCalendarEventsResponse>, Status> {
        let ctx = self.ctx.public_ro(&request).await?;
        Ok(Response::new(
            search_calendar_events::handle(ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_calendar_service(
    ctx: Arc<ServiceContext>,
) -> CalendarServiceServer<CalendarServiceImpl> {
    CalendarServiceServer::new(CalendarServiceImpl { ctx })
}
