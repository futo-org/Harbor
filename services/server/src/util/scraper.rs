//! Endpoints of the internal scraper service (`services/scraper`).

/// Base URL of the scraper service, overridable via `POLYCENTRIC_SCRAPER_URL`.
fn base_url() -> String {
    std::env::var("POLYCENTRIC_SCRAPER_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string())
}

/// URL of the `/scrape` endpoint (link-preview metadata).
pub fn scrape_url() -> String {
    format!("{}/scrape", base_url().trim_end_matches('/'))
}

/// URL of the `/image` endpoint (image proxy).
pub fn image_url() -> String {
    format!("{}/image", base_url().trim_end_matches('/'))
}
