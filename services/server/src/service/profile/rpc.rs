//! gRPC `ProfileService` impl: a profile with its aggregate counters.

pub mod get_profile;

use crate::service::context::{PublicContext, ServiceContext};
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
        let ctx = PublicContext::new(
            &self.ctx.ro_db,
            self.ctx.proof_cache.clone(),
            self.ctx.kafka_producer.clone(),
            &request,
        )
        .await?;
        Ok(Response::new(
            get_profile::handle(ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_profile_service(
    ctx: Arc<ServiceContext>,
) -> ProfileServiceServer<ProfileServiceImpl> {
    ProfileServiceServer::new(ProfileServiceImpl { ctx })
}
