//! gRPC `ServerService` impl. Each method delegates to a handler
//! under `server/rpc/`.

pub mod get_info;

use crate::service::proto::server_service_server::{
    ServerService, ServerServiceServer,
};
use crate::service::proto::{GetServerInfoRequest, GetServerInfoResponse};
use tonic::{Request, Response, Status};

/// Config served by `ServerService.get_info`.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub version: String,
    pub cdn_url: String,
}

#[derive(Debug)]
pub struct ServerServiceImpl {
    config: ServerConfig,
}

#[tonic::async_trait]
impl ServerService for ServerServiceImpl {
    async fn get_info(
        &self,
        request: Request<GetServerInfoRequest>,
    ) -> Result<Response<GetServerInfoResponse>, Status> {
        Ok(Response::new(
            get_info::handle(&self.config, request.into_inner()).await?,
        ))
    }
}

pub fn build_server_service(
    config: ServerConfig,
) -> ServerServiceServer<ServerServiceImpl> {
    ServerServiceServer::new(ServerServiceImpl { config })
}
