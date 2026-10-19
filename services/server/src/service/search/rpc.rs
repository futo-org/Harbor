//! gRPC `SearchService` impl. Each method delegates to a handler under
//! `search/rpc/`.

use std::sync::Arc;
use tonic::{Request, Response, Status};

use crate::service::context::ServiceContext;
use crate::service::proto::search_service_server::{
    SearchService, SearchServiceServer,
};
use crate::service::proto::{
    SearchPostsRequest, SearchPostsResponse, SearchUsersRequest,
    SearchUsersResponse,
};

pub mod common;
pub mod search_posts;
pub mod search_users;

pub use common::*;

pub struct SearchServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl SearchService for SearchServiceImpl {
    async fn search_users(
        &self,
        request: Request<SearchUsersRequest>,
    ) -> Result<Response<SearchUsersResponse>, Status> {
        let ctx = self.ctx.public_ro(&request).await?;
        Ok(Response::new(
            search_users::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn search_posts(
        &self,
        request: Request<SearchPostsRequest>,
    ) -> Result<Response<SearchPostsResponse>, Status> {
        let ctx = self.ctx.public_ro(&request).await?;
        Ok(Response::new(
            search_posts::handle(ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_search_service(
    ctx: Arc<ServiceContext>,
) -> SearchServiceServer<SearchServiceImpl> {
    SearchServiceServer::new(SearchServiceImpl { ctx })
}
