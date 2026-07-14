//! gRPC `ProfileService` impl: a profile with its aggregate counters.

pub mod get_profile;

use crate::service::context::ServiceContext;
use crate::service::proto::profile_service_server::{
    ProfileService, ProfileServiceServer,
};
use crate::service::proto::{GetProfileRequest, GetProfileResponse};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct ProfileServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl ProfileService for ProfileServiceImpl {
    async fn get_profile(
        &self,
        request: Request<GetProfileRequest>,
    ) -> Result<Response<GetProfileResponse>, Status> {
        Ok(Response::new(
            get_profile::handle(&self.ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_profile_service(
    ctx: Arc<ServiceContext>,
) -> ProfileServiceServer<ProfileServiceImpl> {
    ProfileServiceServer::new(ProfileServiceImpl { ctx })
}
