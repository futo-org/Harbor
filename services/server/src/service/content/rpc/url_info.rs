//! `url_info`: fetch link-preview metadata for a URL.
//!
//! The actual fetching, JS prerendering, and Open Graph / HTML extraction are
//! delegated to the internal scraper service (`services/scraper`); this handler
//! calls that service, maps its JSON onto a `UrlInfoResponse`, and caches the
//! outcome in memory (see `CACHE`).

use crate::service::proto::{UrlInfoRequest, UrlInfoResponse};
use crate::util::{http_client, scraper};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{LazyLock, RwLock};
use std::time::{Duration, Instant};
use tonic::{Code, Status};

const MAX_CACHED_URLS: usize = 10_000;
const EVICTION_BATCH: usize = 100;
const SUCCESS_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const FAILURE_TTL: Duration = Duration::from_secs(10 * 60);

/// A cached scrape outcome. Failures the scraper reported for the URL
/// are cached too (with a shorter TTL) so a dead or slow URL doesn't
/// get re-scraped on every request; failures to reach the scraper at
/// all are never cached (see `ScrapeFailure`).
type ScrapeOutcome = Result<UrlInfoResponse, (Code, String)>;

/// Why a scrape failed: `Reported` means the scraper answered for this
/// URL (a property of the target, cacheable); `Unreachable` means the
/// scraper couldn't be reached or gave an unusable response (transient
/// infrastructure trouble, never cached).
#[derive(Debug)]
enum ScrapeFailure {
    Reported(Status),
    Unreachable(Status),
}

/// In-memory cache for `url_info` responses, keyed by trimmed URL.
type UrlInfoCache = RwLock<HashMap<String, (Instant, ScrapeOutcome)>>;

static CACHE: LazyLock<UrlInfoCache> = LazyLock::new(UrlInfoCache::default);

fn ttl(outcome: &ScrapeOutcome) -> Duration {
    match outcome {
        Ok(_) => SUCCESS_TTL,
        Err(_) => FAILURE_TTL,
    }
}

fn get_cached(cache: &UrlInfoCache, key: &str) -> Option<ScrapeOutcome> {
    let entries = cache.read().unwrap();
    let (created, outcome) = entries.get(key)?;
    (created.elapsed() < ttl(outcome)).then(|| outcome.clone())
}

/// Insert an outcome. When the cache is full, drop expired entries;
/// if everything is still live, evict the batch closest to expiry.
fn insert_cached(cache: &UrlInfoCache, key: String, outcome: ScrapeOutcome) {
    let mut entries = cache.write().unwrap();
    if entries.len() >= MAX_CACHED_URLS {
        entries
            .retain(|_, (created, outcome)| created.elapsed() < ttl(outcome));
    }
    if entries.len() >= MAX_CACHED_URLS {
        let mut remaining: Vec<(Duration, &String)> = entries
            .iter()
            .map(|(key, (created, outcome))| {
                (ttl(outcome).saturating_sub(created.elapsed()), key)
            })
            .collect();
        let batch = EVICTION_BATCH.min(remaining.len());
        remaining.select_nth_unstable_by_key(batch - 1, |(left, _)| *left);
        let evicted: Vec<String> = remaining[..batch]
            .iter()
            .map(|(_, key)| (*key).clone())
            .collect();
        for key in evicted {
            entries.remove(&key);
        }
    }
    entries.insert(key, (Instant::now(), outcome));
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

/// Serve from cache, scraping on a miss. Concurrent misses for the
/// same key may each scrape; the last result wins.
async fn lookup(
    cache: &UrlInfoCache,
    scrape_url: &str,
    target_url: &str,
) -> Result<UrlInfoResponse, Status> {
    let key = target_url.trim();
    let outcome = match get_cached(cache, key) {
        Some(outcome) => outcome,
        None => {
            let outcome = match fetch_metadata(scrape_url, key).await {
                Ok(resp) => Ok(resp),
                Err(ScrapeFailure::Unreachable(status)) => return Err(status),
                Err(ScrapeFailure::Reported(status)) => {
                    Err((status.code(), status.message().to_string()))
                }
            };
            insert_cached(cache, key.to_owned(), outcome.clone());
            outcome
        }
    };

    outcome.map_err(|(code, message)| Status::new(code, message))
}

/// Call the scraper's `/scrape` endpoint and map its JSON onto a
/// `UrlInfoResponse`.
async fn fetch_metadata(
    scrape_url: &str,
    target_url: &str,
) -> Result<UrlInfoResponse, ScrapeFailure> {
    let resp = http_client::client()
        .get(scrape_url)
        .query(&[("url", target_url)])
        .send()
        .await
        .map_err(|e| {
            ScrapeFailure::Unreachable(Status::unavailable(format!(
                "scraper request failed: {e}"
            )))
        })?;

    if !resp.status().is_success() {
        return Err(ScrapeFailure::Reported(Status::unavailable(format!(
            "scraper returned status {}",
            resp.status()
        ))));
    }

    let meta: ScrapedMetadata = resp.json().await.map_err(|e| {
        ScrapeFailure::Unreachable(Status::internal(format!(
            "invalid scraper response: {e}"
        )))
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

        let ScrapeFailure::Reported(status) = err else {
            panic!("non-2xx should be a Reported failure");
        };
        assert_eq!(status.code(), Code::Unavailable);
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

        let cache = UrlInfoCache::default();
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

    #[test]
    fn full_cache_evicts_a_batch_of_entries_closest_to_expiry() {
        let cache = UrlInfoCache::default();
        for i in 0..MAX_CACHED_URLS {
            insert_cached(
                &cache,
                format!("https://example.com/{i}"),
                Ok(UrlInfoResponse::default()),
            );
        }
        insert_cached(
            &cache,
            "https://example.com/one-more".to_string(),
            Ok(UrlInfoResponse::default()),
        );

        let entries = cache.read().unwrap();
        assert_eq!(entries.len(), MAX_CACHED_URLS - EVICTION_BATCH + 1);
        assert!(entries.contains_key("https://example.com/one-more"));
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

        let cache = UrlInfoCache::default();
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

        let cache = UrlInfoCache::default();
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

        let ScrapeFailure::Unreachable(status) = err else {
            panic!("a malformed body should be an Unreachable failure");
        };
        assert_eq!(status.code(), Code::Internal);
    }

    #[tokio::test]
    async fn unreachable_scraper_failures_are_not_cached() {
        let cache = UrlInfoCache::default();

        let refused =
            lookup(&cache, "http://127.0.0.1:1/scrape", "https://example.com")
                .await
                .expect_err("unreachable scraper should fail");
        assert_eq!(refused.code(), Code::Unavailable);

        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/scrape")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_body("Recovered"))
            .expect(1)
            .create_async()
            .await;

        let scrape_url = format!("{}/scrape", server.url());
        let recovered = lookup(&cache, &scrape_url, "https://example.com")
            .await
            .expect("retry after recovery should succeed");

        assert_eq!(recovered.title, "Recovered");
        mock.assert_async().await;
    }
}
