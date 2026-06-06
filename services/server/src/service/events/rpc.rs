//! gRPC `EventSyncService` impl. Each method delegates to a handler
//! under `events/rpc/`.

pub mod list_events;
pub mod list_heads;
pub mod put_events;

use crate::service::context::ServiceContext;
use crate::service::proto::event_sync_service_server::{
    EventSyncService, EventSyncServiceServer,
};
use crate::service::proto::{
    ListEventsRequest, ListEventsResponse, PutEventsRequest, PutEventsResponse,
};
use polycentric_common::models::protos_v2::{
    ListHeadsRequest, ListHeadsResponse,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct EventSyncServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl EventSyncService for EventSyncServiceImpl {
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsResponse>, Status> {
        Ok(Response::new(
            list_events::handle(&self.ctx, request.into_inner()).await?,
        ))
    }

    async fn put_events(
        &self,
        request: Request<PutEventsRequest>,
    ) -> Result<Response<PutEventsResponse>, Status> {
        Ok(Response::new(
            put_events::handle(&self.ctx, request.into_inner()).await?,
        ))
    }

    async fn list_heads(
        &self,
        request: Request<ListHeadsRequest>,
    ) -> Result<Response<ListHeadsResponse>, Status> {
        Ok(Response::new(
            list_heads::handle(&self.ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_events_service(
    ctx: Arc<ServiceContext>,
) -> EventSyncServiceServer<EventSyncServiceImpl> {
    EventSyncServiceServer::new(EventSyncServiceImpl { ctx })
}
