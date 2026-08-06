//! Endpoints of the internal scraper service (`services/scraper`).

/// URL of the `/scrape` endpoint (link-preview metadata).
pub fn scrape_url() -> String {
    format!(
        "{}/scrape",
        crate::config::get().scraper_url.trim_end_matches('/')
    )
}

/// URL of the `/image` endpoint (image proxy).
pub fn image_url() -> String {
    format!(
        "{}/image",
        crate::config::get().scraper_url.trim_end_matches('/')
    )
}
