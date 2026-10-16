//! gRPC `EventSyncService` impl. Each method delegates to a handler
//! under `events/rpc/`.

use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    ListHeadsRequest, ListHeadsResponse,
};
use tonic::{Request, Response, Status};

use crate::service::context::{PublicContext, ServiceContext};
use crate::service::proto::event_sync_service_server::{
    EventSyncService, EventSyncServiceServer,
};
use crate::service::proto::{
    GetAttributedToReactionCountsRequest,
    GetAttributedToReactionCountsResponse, GetReactionsRequest,
    GetReactionsResponse, ListEventsRequest, ListEventsResponse,
    PutEventsRequest, PutEventsResponse,
};

pub mod get_attributed_to_reaction_counts;
pub mod get_reactions;
pub mod list_events;
pub mod list_heads;
pub mod put_events;

pub struct EventSyncServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl EventSyncService for EventSyncServiceImpl {
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsResponse>, Status> {
        let ctx = PublicContext::new(
            &self.ctx.ro_db,
            self.ctx.proof_cache.clone(),
            self.ctx.kafka_producer.clone(),
            &request,
        )
        .await?;
        Ok(Response::new(
            list_events::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn put_events(
        &self,
        request: Request<PutEventsRequest>,
    ) -> Result<Response<PutEventsResponse>, Status> {
        let ctx = PublicContext::new(
            &self.ctx.db,
            self.ctx.proof_cache.clone(),
            self.ctx.kafka_producer.clone(),
            &request,
        )
        .await?;
        Ok(Response::new(
            put_events::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn list_heads(
        &self,
        request: Request<ListHeadsRequest>,
    ) -> Result<Response<ListHeadsResponse>, Status> {
        let ctx = PublicContext::new(
            &self.ctx.ro_db,
            self.ctx.proof_cache.clone(),
            self.ctx.kafka_producer.clone(),
            &request,
        )
        .await?;
        Ok(Response::new(
            list_heads::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn get_reactions(
        &self,
        request: Request<GetReactionsRequest>,
    ) -> Result<Response<GetReactionsResponse>, Status> {
        let ctx = PublicContext::new(
            &self.ctx.ro_db,
            self.ctx.proof_cache.clone(),
            self.ctx.kafka_producer.clone(),
            &request,
        )
        .await?;
        Ok(Response::new(
            get_reactions::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn get_attributed_to_reaction_counts(
        &self,
        request: Request<GetAttributedToReactionCountsRequest>,
    ) -> Result<Response<GetAttributedToReactionCountsResponse>, Status> {
        let ctx = PublicContext::new(
            &self.ctx.ro_db,
            self.ctx.proof_cache.clone(),
            self.ctx.kafka_producer.clone(),
            &request,
        )
        .await?;
        let request = request.into_inner();
        Ok(Response::new(
            get_attributed_to_reaction_counts::handle(ctx, request).await?,
        ))
    }
}

pub fn build_events_service(
    ctx: Arc<ServiceContext>,
) -> EventSyncServiceServer<EventSyncServiceImpl> {
    EventSyncServiceServer::new(EventSyncServiceImpl { ctx })
}
