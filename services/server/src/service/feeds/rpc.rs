//! gRPC `FeedsService` impl. Each method delegates to a dedicated
//! handler module under `feeds/rpc/`.

pub mod common;
pub mod get_explore_feed;
pub mod get_following_feed;
pub mod get_identity_feed;
pub mod get_post_thread;

use crate::service::context::ServiceContext;
use crate::service::proto::feeds_service_server::{
    FeedsService, FeedsServiceServer,
};
use crate::service::proto::{
    GetExploreFeedRequest, GetFeedResponse, GetFollowingFeedRequest,
    GetIdentityFeedRequest, GetPostThreadRequest, GetPostThreadResponse,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct FeedsServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl FeedsService for FeedsServiceImpl {
    async fn get_identity_feed(
        &self,
        request: Request<GetIdentityFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        Ok(Response::new(
            get_identity_feed::handle(&self.ctx, request.into_inner()).await?,
        ))
    }

    async fn get_following_feed(
        &self,
        request: Request<GetFollowingFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        Ok(Response::new(
            get_following_feed::handle(&self.ctx, request.into_inner()).await?,
        ))
    }

    async fn get_explore_feed(
        &self,
        request: Request<GetExploreFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        Ok(Response::new(
            get_explore_feed::handle(&self.ctx, request.into_inner()).await?,
        ))
    }

    async fn get_post_thread(
        &self,
        request: Request<GetPostThreadRequest>,
    ) -> Result<Response<GetPostThreadResponse>, Status> {
        Ok(Response::new(
            get_post_thread::handle(&self.ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_feeds_service(
    ctx: Arc<ServiceContext>,
) -> FeedsServiceServer<FeedsServiceImpl> {
    FeedsServiceServer::new(FeedsServiceImpl { ctx })
}
