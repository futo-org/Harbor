//! Shared HTTP client for outbound requests.

use std::sync::OnceLock;
use std::time::Duration;

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(60))
            .build()
            .expect("failed to build HTTP client")
    })
}

/// Headers carrying the current span's trace context.
pub fn trace_headers() -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    common_telemetry::trace::inject_headers(&mut headers);
    headers
}
