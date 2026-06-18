//! HTTP client for the internal scraper service (`services/scraper`).
//!
//! All outbound fetching of untrusted URLs (page metadata *and* preview images)
//! is delegated to that service, so SSRF is constrained in **one** place — its
//! network egress — rather than spread across the Rust server.

use std::sync::OnceLock;

/// Base URL of the scraper service, overridable via `SCRAPER_URL`.
pub fn scraper_service_base_url() -> String {
    std::env::var("SCRAPER_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string())
}

/// Shared HTTP client for talking to the scraper. Deliberately a plain client,
/// not a SSRF-guarded one: the scraper is a trusted internal host.
pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}
