//! HTTP client for the internal scraper service (`services/scraper`).

use std::sync::OnceLock;

/// Base URL of the scraper service, overridable via `SCRAPER_URL`.
pub fn scraper_service_base_url() -> String {
    std::env::var("SCRAPER_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string())
}

/// Shared HTTP client for talking to the scraper.
pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}
