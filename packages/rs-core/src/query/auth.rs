//! Auth tokens for outgoing gRPC requests. The embedder registers an
//! [`AuthTokenProvider`]; tokens are cached per server until they expire.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

use tonic::metadata::AsciiMetadataValue;
use tonic::{Request, Status};

/// Stop reusing a cached token this many seconds before it expires.
const EXPIRY_MARGIN_SECONDS: u64 = 60;

/// A bearer token and when it expires (seconds since the unix epoch).
#[derive(uniffi::Record)]
pub struct AuthToken {
    pub token: String,
    pub expires_at: u64,
}

/// Mints auth tokens. Implemented by the embedder, called only when no
/// unexpired token is cached for the server.
// wasm32 runs uniffi single-threaded, where the generated foreign impl returns
// non-Send futures, so the trait must be declared the same way.
#[uniffi::export(with_foreign)]
#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
pub trait AuthTokenProvider: Send + Sync {
    /// A fresh token for `server_url`, or `None` to send requests to it
    /// unauthenticated.
    async fn auth_token(&self, server_url: String) -> Option<AuthToken>;
}

static PROVIDER: RwLock<Option<Arc<dyn AuthTokenProvider>>> = RwLock::new(None);

struct CachedBearer {
    bearer: AsciiMetadataValue,
    expires_at: u64,
}

/// Bearer values by server, kept until they expire.
static TOKENS: LazyLock<RwLock<HashMap<String, CachedBearer>>> = LazyLock::new(Default::default);

/// Register the token provider and drop any previously cached tokens.
pub fn set_auth_token_provider(provider: Arc<dyn AuthTokenProvider>) {
    *PROVIDER.write().unwrap() = Some(provider);
    clear_auth_tokens();
}

/// Drop all cached tokens, e.g. after an identity change.
pub fn clear_auth_tokens() {
    TOKENS.write().unwrap().clear();
}

/// Adds `authorization: Bearer <token>` to each outgoing request.
#[derive(Clone)]
pub struct AuthInterceptor {
    bearer: Option<AsciiMetadataValue>,
}

impl tonic::service::Interceptor for AuthInterceptor {
    fn call(&mut self, mut request: Request<()>) -> Result<Request<()>, Status> {
        if let Some(bearer) = &self.bearer {
            request
                .metadata_mut()
                .insert("authorization", bearer.clone());
        }
        Ok(request)
    }
}

/// The interceptor for a channel to `server_url`.
pub async fn interceptor_for(server_url: &str) -> AuthInterceptor {
    AuthInterceptor {
        bearer: bearer_for(server_url).await,
    }
}

/// The bearer header for `server_url`, cached until near expiry.
async fn bearer_for(server_url: &str) -> Option<AsciiMetadataValue> {
    let now = now_secs();
    if let Some(cached) = TOKENS.read().unwrap().get(server_url)
        && now < cached.expires_at.saturating_sub(EXPIRY_MARGIN_SECONDS)
    {
        return Some(cached.bearer.clone());
    }

    let provider = PROVIDER.read().unwrap().clone()?;
    let token = provider.auth_token(server_url.to_string()).await?;
    let bearer: AsciiMetadataValue = format!("Bearer {}", token.token).parse().ok()?;
    TOKENS.write().unwrap().insert(
        server_url.to_string(),
        CachedBearer {
            bearer: bearer.clone(),
            expires_at: token.expires_at,
        },
    );
    Some(bearer)
}

#[cfg(not(target_arch = "wasm32"))]
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(target_arch = "wasm32")]
fn now_secs() -> u64 {
    (js_sys::Date::now() / 1000.0) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
    use tonic::service::Interceptor;

    /// Counts mints; hands out tokens that expire `ttl` seconds from now.
    struct CountingProvider {
        mints: AtomicUsize,
        ttl: AtomicU64,
    }

    #[async_trait::async_trait]
    impl AuthTokenProvider for CountingProvider {
        async fn auth_token(&self, server_url: String) -> Option<AuthToken> {
            let mint = self.mints.fetch_add(1, Ordering::SeqCst) + 1;
            Some(AuthToken {
                token: format!("{server_url}-{mint}"),
                expires_at: now_secs() + self.ttl.load(Ordering::SeqCst),
            })
        }
    }

    fn register(ttl: u64) -> Arc<CountingProvider> {
        let provider = Arc::new(CountingProvider {
            mints: AtomicUsize::new(0),
            ttl: AtomicU64::new(ttl),
        });
        set_auth_token_provider(provider.clone());
        provider
    }

    /// Single test: the registry and cache are process-global, parallel
    /// tests would race.
    #[tokio::test]
    async fn stamps_caches_and_renews_tokens() {
        // Valid token: stamped as a bearer header, one mint across two
        // requests.
        let provider = register(3600);
        let request = interceptor_for("https://a.example")
            .await
            .call(Request::new(()))
            .unwrap();
        assert_eq!(
            request.metadata().get("authorization").unwrap(),
            &"Bearer https://a.example-1"
                .parse::<AsciiMetadataValue>()
                .unwrap()
        );
        assert_eq!(
            bearer_for("https://a.example")
                .await
                .unwrap()
                .to_str()
                .unwrap(),
            "Bearer https://a.example-1"
        );
        assert_eq!(provider.mints.load(Ordering::SeqCst), 1);

        // Already-expired tokens are re-minted on every request.
        let provider = register(0);
        bearer_for("https://b.example").await;
        let renewed = bearer_for("https://b.example").await;
        assert_eq!(provider.mints.load(Ordering::SeqCst), 2);
        assert_eq!(
            renewed.unwrap().to_str().unwrap(),
            "Bearer https://b.example-2"
        );
    }

    #[test]
    fn sends_nothing_without_a_token() {
        let mut interceptor = AuthInterceptor { bearer: None };
        let request = interceptor.call(Request::new(())).unwrap();
        assert!(request.metadata().get("authorization").is_none());
    }
}
