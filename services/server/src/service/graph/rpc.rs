//! gRPC `GraphService` impl: paginated follow-edge listings.

pub mod list_follows;

use crate::service::context::ServiceContext;
use crate::service::proto::graph_service_server::{
    GraphService, GraphServiceServer,
};
use crate::service::proto::{
    ListFollowersRequest, ListFollowingRequest, ListFollowsResponse,
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
                &req.page_params,
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
                &req.page_params,
                Direction::Followers,
            )
            .await?,
        ))
    }
}

pub fn build_graph_service(
    ctx: Arc<ServiceContext>,
) -> GraphServiceServer<GraphServiceImpl> {
    GraphServiceServer::new(GraphServiceImpl { ctx })
}
