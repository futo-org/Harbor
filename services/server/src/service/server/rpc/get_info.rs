//! `get_info`: returns server version + CDN URL.

use crate::service::proto::{
    GetServerInfoRequest, GetServerInfoResponse, ServerInfo, ServerVersion,
};
use crate::service::server::rpc::ServerConfig;
use tonic::Status;

pub async fn handle(
    config: &ServerConfig,
    _req: GetServerInfoRequest,
) -> Result<GetServerInfoResponse, Status> {
    Ok(GetServerInfoResponse {
        server_info: Some(ServerInfo {
            version: Some(ServerVersion {
                version: config.version.clone(),
            }),
            cdn_url: config.cdn_url.clone(),
        }),
    })
}
