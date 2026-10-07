//! gRPC channel construction shared across transport-using modules.
//! On wasm32 we use `tonic-web-wasm-client`; on native targets we use
//! `tonic`'s built-in transport with optional TLS. Channels are wrapped in
//! an auth interceptor (see [`crate::query::auth`]).
//!
//! Wrapped channels are cached per server URL and cloned for every request,
//! so a burst against one server multiplexes over a single connection.

#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
use std::collections::HashMap;
#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
use std::sync::{LazyLock, RwLock};

#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
use crate::lock::RwLockRecover;
use tonic::service::interceptor::InterceptedService;

use crate::query::auth;

#[cfg(target_arch = "wasm32")]
type RawChannel = tonic_web_wasm_client::Client;
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
type RawChannel = tonic::transport::Channel;

#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
pub type GrpcChannel = InterceptedService<RawChannel, auth::AuthInterceptor>;

/// Wrapped channels by server URL. Bounded by the distinct server URLs ever
/// used; never evicted.
#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
static CHANNELS: LazyLock<RwLock<HashMap<String, GrpcChannel>>> = LazyLock::new(Default::default);

/// Returns a channel to `server_url`, reusing a cached one when possible.
/// Clones of a cached channel share the underlying connection, so repeated
/// calls mux over one connection per server. The bearer is minted/refreshed
/// before every call and stamped onto each request by [`auth::AuthInterceptor`].
#[cfg(any(target_arch = "wasm32", feature = "native-transport"))]
pub async fn channel(server_url: &str) -> Result<GrpcChannel, String> {
    let interceptor = auth::interceptor_for(server_url).await;

    // First check if the channel is already created, and return if so
    if let Some(cached) = CHANNELS.read_recover().get(server_url) {
        return Ok(cached.clone());
    }

    // If it hasn't been created, we get a write lock to block other readers,
    // which ensures only one channel per server.
    let mut channels = CHANNELS.write_recover();
    if let Some(cached) = channels.get(server_url) {
        return Ok(cached.clone());
    }

    let channel = InterceptedService::new(raw_channel(server_url)?, interceptor);
    channels.insert(server_url.to_string(), channel.clone());
    Ok(channel)
}

#[cfg(target_arch = "wasm32")]
fn raw_channel(server_url: &str) -> Result<RawChannel, String> {
    Ok(tonic_web_wasm_client::Client::new(server_url.to_string()))
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn raw_channel(server_url: &str) -> Result<RawChannel, String> {
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

#[cfg(all(test, any(target_arch = "wasm32", feature = "native-transport")))]
mod tests {
    use super::*;

    fn entries(url: &str) -> usize {
        CHANNELS
            .read_recover()
            .keys()
            .filter(|key| key.as_str() == url)
            .count()
    }

    /// Single test: the channel cache is process-global, parallel tests
    /// would race.
    #[tokio::test]
    async fn caches_one_channel_per_server_url() {
        let https = "https://cache.test";
        let http = "http://cache.test";

        assert!(CHANNELS.read_recover().get(https).is_none());

        // First call builds and caches; next returns the cached
        channel(https).await.unwrap();
        assert_eq!(entries(https), 1);
        channel(https).await.unwrap();
        assert_eq!(entries(https), 1);

        // http:// and https:// URLs cache as distinct channels; TLS is only
        // configured for the https form.
        channel(http).await.unwrap();
        assert_eq!(entries(https), 1);
        assert_eq!(entries(http), 1);
    }

    #[tokio::test]
    async fn invalid_urls_are_not_cached() {
        let url = "not a url";
        assert!(channel(url).await.is_err());
        assert!(CHANNELS.read_recover().get(url).is_none());
    }
}
