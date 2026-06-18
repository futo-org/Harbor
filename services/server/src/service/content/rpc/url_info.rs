//! `url_info`: fetch link-preview metadata for a URL and return it as a `Link`.
//!
//! The actual fetching, JS prerendering, and Open Graph / HTML extraction are
//! delegated to the internal scraper service (`services/scraper`); this handler
//! just validates the target, calls that service, and maps its JSON onto a
//! `Link`.

use crate::service::proto::{Link, UrlInfoRequest};
use crate::util::safe_http;
use serde::Deserialize;
use std::sync::OnceLock;
use tonic::Status;

/// JSON returned by the scraper service's `/scrape` endpoint.
#[derive(Deserialize)]
struct ScrapedMetadata {
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
}

/// Base URL of the internal scraper service, overridable via `SCRAPER_URL`.
fn scraper_base_url() -> String {
    std::env::var("SCRAPER_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string())
}

/// Plain HTTP client for talking to the scraper. Deliberately *not*
/// `safe_http` — the scraper is a trusted internal host, and the SSRF guard
/// would reject its internal address.
fn scraper_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

pub async fn handle(req: UrlInfoRequest) -> Result<Link, Status> {
    // Validate the target up front: http/https only, and reject internal hosts
    // so we never ask the scraper to fetch our own network. (The scraper does
    // the real fetch; its egress must also be constrained — see its notes.)
    let url =
        safe_http::validate_url(&req.url).map_err(Status::invalid_argument)?;

    let resp = scraper_client()
        .get(format!(
            "{}/scrape",
            scraper_base_url().trim_end_matches('/')
        ))
        .query(&[("url", url.as_str())])
        .send()
        .await
        .map_err(|e| {
            Status::unavailable(format!("scraper request failed: {e}"))
        })?;

    if !resp.status().is_success() {
        return Err(Status::unavailable(format!(
            "scraper returned status {}",
            resp.status()
        )));
    }

    let meta: ScrapedMetadata = resp.json().await.map_err(|e| {
        Status::internal(format!("invalid scraper response: {e}"))
    })?;

    Ok(Link {
        title: meta.title.unwrap_or_default(),
        description: meta.description.unwrap_or_default(),
        image: meta.image.unwrap_or_default(),
        // Echo the requested URL (not the scraper's canonical one) so the
        // Link's displayed host matches what the user posted.
        url: req.url,
    })
}
