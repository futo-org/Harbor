//! gRPC `VerificationsService` impl. Each method delegates to a handler
//! under `verifications/rpc/`.

pub mod list_claims;

use crate::service::context::ServiceContext;
use crate::service::proto::verifications_service_server::{
    VerificationsService, VerificationsServiceServer,
};
use crate::service::proto::{ListClaimsRequest, ListClaimsResponse};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct VerificationsServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl VerificationsService for VerificationsServiceImpl {
    async fn list_claims(
        &self,
        request: Request<ListClaimsRequest>,
    ) -> Result<Response<ListClaimsResponse>, Status> {
        Ok(Response::new(
            list_claims::handle(&self.ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_verifications_service(
    ctx: Arc<ServiceContext>,
) -> VerificationsServiceServer<VerificationsServiceImpl> {
    VerificationsServiceServer::new(VerificationsServiceImpl { ctx })
}
