use crate::lib::proto::events_service_server::{
    EventsService, EventsServiceServer,
};
use crate::lib::proto::{
    ListEventsRequest, ListEventsResponse, SyncEventsRequest,
    SyncEventsResponse,
};
use tonic::{Request, Response, Status};

#[derive(Debug, Default)]
pub struct EventsServiceImpl {}

/// Implementation of the EventsService
#[tonic::async_trait]
impl EventsService for EventsServiceImpl {
    // List events based on the request values
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsResponse>, Status> {
        let _limit = request.into_inner().limit.unwrap_or(10).max(200);
        let reply = ListEventsResponse { events: vec![] };
        Ok(Response::new(reply))
    }

    // Sync events from a client to the server
    async fn sync_events(
        &self,
        _request: Request<SyncEventsRequest>,
    ) -> Result<Response<SyncEventsResponse>, Status> {
        Ok(Response::new(SyncEventsResponse {}))
    }
}

pub fn build_events_service() -> EventsServiceServer<EventsServiceImpl> {
    let events = EventsServiceImpl::default();
    EventsServiceServer::new(events)
}
