//! gRPC `GraphService` impl: paginated follow-edge listings.

pub mod list_follows;
pub mod suggest_follow;

use crate::service::auth::authenticated_identity;
use crate::service::context::{RequestContext, ServiceContext};
use crate::service::proto::graph_service_server::{
    GraphService, GraphServiceServer,
};
use crate::service::proto::{
    ListFollowersRequest, ListFollowingRequest, ListFollowsResponse,
    SuggestFollowRequest, SuggestFollowResponse,
};
use list_follows::Direction;
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct GraphServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl GraphService for GraphServiceImpl {
    async fn list_following(
        &self,
        request: Request<ListFollowingRequest>,
    ) -> Result<Response<ListFollowsResponse>, Status> {
        let req = request.into_inner();
        Ok(Response::new(
            list_follows::handle(
                &self.ctx,
                req.identity,
                req.page_params.as_ref(),
                Direction::Following,
            )
            .await?,
        ))
    }

    async fn list_followers(
        &self,
        request: Request<ListFollowersRequest>,
    ) -> Result<Response<ListFollowsResponse>, Status> {
        let req = request.into_inner();
        Ok(Response::new(
            list_follows::handle(
                &self.ctx,
                req.identity,
                req.page_params.as_ref(),
                Direction::Followers,
            )
            .await?,
        ))
    }

    async fn suggest_follow(
        &self,
        request: Request<SuggestFollowRequest>,
    ) -> Result<Response<SuggestFollowResponse>, Status> {
        let caller = authenticated_identity(&request);
        let ctx = RequestContext::new(&self.ctx, caller.as_deref());
        Ok(Response::new(
            suggest_follow::handle(&ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_graph_service(
    ctx: Arc<ServiceContext>,
) -> GraphServiceServer<GraphServiceImpl> {
    GraphServiceServer::new(GraphServiceImpl { ctx })
}
