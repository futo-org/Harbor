//! gRPC channel construction shared across transport-using modules.
//! On wasm32 we use `tonic-web-wasm-client`; on native targets we use
//! `tonic`'s built-in transport with optional TLS. Channels are wrapped in
//! an auth interceptor (see [`crate::query::auth`]).

use crate::query::auth;
use tonic::service::interceptor::InterceptedService;

#[cfg(target_arch = "wasm32")]
type RawChannel = tonic_web_wasm_client::Client;
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
type RawChannel = tonic::transport::Channel;

#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
pub type GrpcChannel = InterceptedService<RawChannel, auth::AuthInterceptor>;

#[cfg(target_arch = "wasm32")]
pub async fn channel(server_url: &str) -> Result<GrpcChannel, String> {
    let client = tonic_web_wasm_client::Client::new(server_url.to_string());
    Ok(InterceptedService::new(
        client,
        auth::interceptor_for(server_url).await,
    ))
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
pub async fn channel(server_url: &str) -> Result<GrpcChannel, String> {
    let mut endpoint = tonic::transport::Channel::from_shared(server_url.to_string())
        .map_err(|e| format!("Invalid server url: {e}"))?;
    if server_url.starts_with("https://") {
        let tls = tonic::transport::ClientTlsConfig::new().with_webpki_roots();
        endpoint = endpoint
            .tls_config(tls)
            .map_err(|e| format!("TLS config: {e}"))?;
    }
    Ok(InterceptedService::new(
        endpoint.connect_lazy(),
        auth::interceptor_for(server_url).await,
    ))
}
