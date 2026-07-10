//! gRPC `VerificationsService` impl.

pub mod common;
pub mod list_targeted_verification_claims;
pub mod list_verification_claims;
pub mod list_verification_targets;
pub mod list_verification_verifies;

use crate::service::context::ServiceContext;
use crate::service::proto::verifications_service_server::{
    VerificationsService, VerificationsServiceServer,
};
use crate::service::proto::{
    ListTargetedVerificationClaimsRequest,
    ListTargetedVerificationClaimsResponse, ListVerificationClaimsRequest,
    ListVerificationClaimsResponse, ListVerificationTargetsRequest,
    ListVerificationTargetsResponse, ListVerificationVerifiesRequest,
    ListVerificationVerifiesResponse,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct VerificationsServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl VerificationsService for VerificationsServiceImpl {
    async fn list_verification_claims(
        &self,
        request: Request<ListVerificationClaimsRequest>,
    ) -> Result<Response<ListVerificationClaimsResponse>, Status> {
        Ok(Response::new(
            list_verification_claims::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn list_verification_targets(
        &self,
        request: Request<ListVerificationTargetsRequest>,
    ) -> Result<Response<ListVerificationTargetsResponse>, Status> {
        Ok(Response::new(
            list_verification_targets::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn list_verification_verifies(
        &self,
        request: Request<ListVerificationVerifiesRequest>,
    ) -> Result<Response<ListVerificationVerifiesResponse>, Status> {
        Ok(Response::new(
            list_verification_verifies::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn list_targeted_verification_claims(
        &self,
        request: Request<ListTargetedVerificationClaimsRequest>,
    ) -> Result<Response<ListTargetedVerificationClaimsResponse>, Status> {
        Ok(Response::new(
            list_targeted_verification_claims::handle(
                &self.ctx,
                request.into_inner(),
            )
            .await?,
        ))
    }
}

pub fn build_verifications_service(
    ctx: Arc<ServiceContext>,
) -> VerificationsServiceServer<VerificationsServiceImpl> {
    VerificationsServiceServer::new(VerificationsServiceImpl { ctx })
}
