//! gRPC `IdentityService` impl. Each method delegates to a handler
//! under `identity/rpc/`.
//!
//! These moderation endpoints are gated on the caller's authenticated
//! identity (populated by `auth_middleware` from the bearer JWT and read
//! from the request extensions): the ban endpoints require a moderator.

pub mod common;
pub mod is_banned;
pub mod is_moderator;
pub mod list_bans;
pub mod set_ban_status;

use crate::service::context::ServiceContext;
use crate::service::proto::identity_service_server::{
    IdentityService, IdentityServiceServer,
};
use crate::service::proto::{
    IsBannedRequest, IsBannedResponse, IsModeratorRequest, IsModeratorResponse,
    ListBansRequest, ListBansResponse, SetBanStatusRequest,
    SetBanStatusResponse,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct IdentityServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl IdentityService for IdentityServiceImpl {
    async fn is_moderator(
        &self,
        request: Request<IsModeratorRequest>,
    ) -> Result<Response<IsModeratorResponse>, Status> {
        Ok(Response::new(
            is_moderator::handle(&self.ctx, request).await?,
        ))
    }

    async fn set_ban_status(
        &self,
        request: Request<SetBanStatusRequest>,
    ) -> Result<Response<SetBanStatusResponse>, Status> {
        Ok(Response::new(
            set_ban_status::handle(&self.ctx, request).await?,
        ))
    }

    async fn is_banned(
        &self,
        request: Request<IsBannedRequest>,
    ) -> Result<Response<IsBannedResponse>, Status> {
        Ok(Response::new(is_banned::handle(&self.ctx, request).await?))
    }

    async fn list_bans(
        &self,
        request: Request<ListBansRequest>,
    ) -> Result<Response<ListBansResponse>, Status> {
        Ok(Response::new(list_bans::handle(&self.ctx, request).await?))
    }
}

/// Creates the identity gRPC service.
pub fn build_identity_service(
    ctx: Arc<ServiceContext>,
) -> IdentityServiceServer<IdentityServiceImpl> {
    IdentityServiceServer::new(IdentityServiceImpl { ctx })
}
