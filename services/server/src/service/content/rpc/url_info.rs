//! `url_info`: fetch link-preview metadata for a URL.
//!
//! The actual fetching, JS prerendering, and Open Graph / HTML extraction are
//! delegated to the internal scraper service (`services/scraper`); this handler
//! calls that service, maps its JSON onto a `UrlInfoResponse`, and caches the
//! outcome in memory (see `CACHE`).

use crate::service::proto::{UrlInfoRequest, UrlInfoResponse};
use crate::util::{http_client, scraper};
use moka::Expiry;
use moka::future::Cache;
use serde::Deserialize;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use tonic::{Code, Status};

const MAX_CACHED_URLS: u64 = 10_000;
const SUCCESS_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const FAILURE_TTL: Duration = Duration::from_secs(10 * 60);

/// A cached scrape outcome. Failures are cached too (with a shorter
/// TTL) so a dead or slow URL doesn't get re-scraped on every request.
#[derive(Clone)]
enum CacheEntry {
    Success(UrlInfoResponse),
    Failure { code: Code, message: String },
}

struct EntryExpiry;

impl Expiry<String, CacheEntry> for EntryExpiry {
    fn expire_after_create(
        &self,
        _key: &String,
        value: &CacheEntry,
        _created_at: Instant,
    ) -> Option<Duration> {
        Some(match value {
            CacheEntry::Success(_) => SUCCESS_TTL,
            CacheEntry::Failure { .. } => FAILURE_TTL,
        })
    }
}

fn new_cache() -> Cache<String, CacheEntry> {
    Cache::builder()
        .max_capacity(MAX_CACHED_URLS)
        .expire_after(EntryExpiry)
        .build()
}

/// In-memory cache for `url_info` responses. Concurrent requests for
/// the same URL are coalesced into a single scraper call.
static CACHE: LazyLock<Cache<String, CacheEntry>> = LazyLock::new(new_cache);

/// Cache key for a URL: trimmed of surrounding whitespace.
fn cache_key(url: &str) -> String {
    url.trim().to_string()
}

/// JSON returned by the scraper service's `/scrape` endpoint.
#[derive(Deserialize)]
struct ScrapedMetadata {
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
}

pub async fn handle(req: UrlInfoRequest) -> Result<UrlInfoResponse, Status> {
    lookup(&CACHE, &scraper::scrape_url(), &req.url).await
}

/// Serve from cache, scraping on a miss. `get_with` guarantees that
/// concurrent misses for the same key run the scrape only once.
async fn lookup(
    cache: &Cache<String, CacheEntry>,
    scrape_url: &str,
    target_url: &str,
) -> Result<UrlInfoResponse, Status> {
    let key = cache_key(target_url);
    let entry = cache
        .get_with(key.clone(), async {
            match fetch_metadata(scrape_url, &key).await {
                Ok(resp) => CacheEntry::Success(resp),
                Err(status) => CacheEntry::Failure {
                    code: status.code(),
                    message: status.message().to_string(),
                },
            }
        })
        .await;

    match entry {
        CacheEntry::Success(resp) => Ok(resp),
        CacheEntry::Failure { code, message } => {
            Err(Status::new(code, message))
        }
    }
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

    fn success_body(title: &str) -> String {
        format!(r#"{{"title":"{title}","description":"","image":""}}"#)
    }

    #[tokio::test]
    async fn second_lookup_is_served_from_cache() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_body("Cached"))
            .expect(1)
            .create_async()
            .await;

        let cache = new_cache();
        let scrape_url = format!("{}/scrape", server.url());
        let first = lookup(&cache, &scrape_url, "https://example.com")
            .await
            .expect("first lookup should succeed");
        let second = lookup(&cache, &scrape_url, "https://example.com")
            .await
            .expect("second lookup should succeed");

        assert_eq!(first.title, "Cached");
        assert_eq!(second.title, "Cached");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn concurrent_lookups_coalesce_into_one_scrape() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_body("Once"))
            .expect(1)
            .create_async()
            .await;

        let cache = new_cache();
        let scrape_url = format!("{}/scrape", server.url());
        let (a, b) = tokio::join!(
            lookup(&cache, &scrape_url, "https://example.com"),
            lookup(&cache, &scrape_url, "https://example.com"),
        );

        assert_eq!(a.expect("should succeed").title, "Once");
        assert_eq!(b.expect("should succeed").title, "Once");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn failures_are_cached() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(502)
            .expect(1)
            .create_async()
            .await;

        let cache = new_cache();
        let scrape_url = format!("{}/scrape", server.url());
        let first = lookup(&cache, &scrape_url, "https://dead.test")
            .await
            .expect_err("first lookup should fail");
        let second = lookup(&cache, &scrape_url, "https://dead.test")
            .await
            .expect_err("second lookup should fail");

        assert_eq!(first.code(), Code::Unavailable);
        assert_eq!(second.code(), Code::Unavailable);
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn surrounding_whitespace_shares_a_cache_entry() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::UrlEncoded(
                "url".into(),
                "https://example.com/page".into(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_body("Normalized"))
            .expect(1)
            .create_async()
            .await;

        let cache = new_cache();
        let scrape_url = format!("{}/scrape", server.url());
        let first = lookup(&cache, &scrape_url, "https://example.com/page")
            .await
            .expect("plain URL should succeed");
        let second = lookup(&cache, &scrape_url, " https://example.com/page ")
            .await
            .expect("whitespace variant should hit the same entry");

        assert_eq!(first.title, "Normalized");
        assert_eq!(second.title, "Normalized");
        mock.assert_async().await;
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
