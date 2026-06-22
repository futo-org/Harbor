//! `url_info`: fetch link-preview metadata for a URL and return it as a `Link`.
//!
//! The actual fetching, JS prerendering, and Open Graph / HTML extraction are
//! delegated to the internal scraper service (`services/scraper`); this handler
//! just validates the target, calls that service, and maps its JSON onto a
//! `Link`.

use crate::service::proto::{Link, UrlInfoRequest};
use crate::util::{http_client, scraper};
use serde::Deserialize;
use tonic::Status;

/// JSON returned by the scraper service's `/scrape` endpoint.
#[derive(Deserialize)]
struct ScrapedMetadata {
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
}

pub async fn handle(req: UrlInfoRequest) -> Result<Link, Status> {
    let resp = http_client::client()
        .get(scraper::scrape_url())
        .query(&[("url", req.url.as_str())])
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
