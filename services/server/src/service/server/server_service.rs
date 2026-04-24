use crate::service::proto::server_service_server::{
    ServerService, ServerServiceServer,
};
use crate::service::proto::{
    GetServerInfoRequest, GetServerInfoResponse, ServerInfo, ServerVersion,
};
use tonic::{Request, Response, Status};

/// Config served by `ServerService.GetInfo`.
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
        _request: Request<GetServerInfoRequest>,
    ) -> Result<Response<GetServerInfoResponse>, Status> {
        Ok(Response::new(GetServerInfoResponse {
            server_info: Some(ServerInfo {
                version: Some(ServerVersion {
                    version: self.config.version.clone(),
                }),
                cdn_url: self.config.cdn_url.clone(),
            }),
        }))
    }
}

pub fn build_server_service(
    config: ServerConfig,
) -> ServerServiceServer<ServerServiceImpl> {
    ServerServiceServer::new(ServerServiceImpl { config })
}
