//! gRPC channel construction shared across transport-using modules.
//! On wasm32 we use `tonic-web-wasm-client`; on native targets we use
//! `tonic`'s built-in transport with optional TLS.

#[cfg(target_arch = "wasm32")]
pub type GrpcChannel = tonic_web_wasm_client::Client;
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
pub type GrpcChannel = tonic::transport::Channel;

#[cfg(target_arch = "wasm32")]
pub fn channel(server_url: &str) -> Result<GrpcChannel, String> {
    Ok(tonic_web_wasm_client::Client::new(server_url.to_string()))
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
pub fn channel(server_url: &str) -> Result<GrpcChannel, String> {
    let mut endpoint = tonic::transport::Channel::from_shared(server_url.to_string())
        .map_err(|e| format!("Invalid server url: {e}"))?;
    if server_url.starts_with("https://") {
        let tls = tonic::transport::ClientTlsConfig::new().with_webpki_roots();
        endpoint = endpoint
            .tls_config(tls)
            .map_err(|e| format!("TLS config: {e}"))?;
    }
    Ok(endpoint.connect_lazy())
}
