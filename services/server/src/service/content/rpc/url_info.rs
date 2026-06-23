//! `url_info`: fetch link-preview metadata for a URL.
//!
//! The actual fetching, JS prerendering, and Open Graph / HTML extraction are
//! delegated to the internal scraper service (`services/scraper`); this handler
//! just calls that service and maps its JSON onto a `UrlInfoResponse`.

use crate::service::proto::{UrlInfoRequest, UrlInfoResponse};
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

pub async fn handle(req: UrlInfoRequest) -> Result<UrlInfoResponse, Status> {
    fetch_metadata(&scraper::scrape_url(), &req.url).await
}

/// Call the scraper's `/scrape` endpoint and map its JSON onto a
/// `UrlInfoResponse`.
async fn fetch_metadata(
    scrape_url: &str,
    target_url: &str,
) -> Result<UrlInfoResponse, Status> {
    let resp = http_client::client()
        .get(scrape_url)
        .query(&[("url", target_url)])
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

    Ok(UrlInfoResponse {
        title: meta.title.unwrap_or_default(),
        description: meta.description.unwrap_or_default(),
        image: meta.image.unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tonic::Code;

    // Each test gets its own mock server (own port) and passes its URL
    // directly, so there's no shared global state — they run in parallel.

    #[tokio::test]
    async fn maps_scraper_metadata_onto_response() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/scrape")
            // Confirms `handle` forwards the requested URL as the `url` param.
            .match_query(mockito::Matcher::UrlEncoded(
                "url".into(),
                "https://example.com".into(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{"title":"Example","description":"Desc","image":"https://img/x.png"}"#,
            )
            .create_async()
            .await;

        let scrape_url = format!("{}/scrape", server.url());
        let resp = fetch_metadata(&scrape_url, "https://example.com")
            .await
            .expect("should map metadata");

        assert_eq!(resp.title, "Example");
        assert_eq!(resp.description, "Desc");
        assert_eq!(resp.image, "https://img/x.png");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn missing_fields_default_to_empty_strings() {
        let mut server = mockito::Server::new_async().await;
        // Bound to a variable: a dropped Mock is removed from the server.
        let _mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"title":"Only title"}"#)
            .create_async()
            .await;

        let scrape_url = format!("{}/scrape", server.url());
        let resp = fetch_metadata(&scrape_url, "https://x.test")
            .await
            .expect("should map metadata");

        assert_eq!(resp.title, "Only title");
        assert_eq!(resp.description, "");
        assert_eq!(resp.image, "");
    }

    #[tokio::test]
    async fn non_success_status_is_unavailable() {
        let mut server = mockito::Server::new_async().await;
        let _mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(502)
            .create_async()
            .await;

        let scrape_url = format!("{}/scrape", server.url());
        let err = fetch_metadata(&scrape_url, "https://x.test")
            .await
            .expect_err("non-2xx should error");

        assert_eq!(err.code(), Code::Unavailable);
    }

    #[tokio::test]
    async fn malformed_body_is_internal() {
        let mut server = mockito::Server::new_async().await;
        let _mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("not json")
            .create_async()
            .await;

        let scrape_url = format!("{}/scrape", server.url());
        let err = fetch_metadata(&scrape_url, "https://x.test")
            .await
            .expect_err("invalid JSON should error");

        assert_eq!(err.code(), Code::Internal);
    }
}
