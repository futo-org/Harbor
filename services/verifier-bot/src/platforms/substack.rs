use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{profile_fetch_error, require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?(.+)\.substack\.com/?").unwrap());

struct SubstackText;

pub fn verifier() -> Verifier {
    Verifier::text("Substack", SubstackText)
}

/// The page's `og:description`, trimmed; `None` when missing or empty.
fn og_description(html: &str) -> Option<String> {
    let selector = Selector::parse(r#"meta[property="og:description"]"#).expect("valid selector");
    Html::parse_document(html)
        .select(&selector)
        .next()
        .and_then(|node| node.value().attr("content"))
        .filter(|d| !d.is_empty())
        .map(|d| d.trim().to_string())
}

#[async_trait]
impl TextPlatform for SubstackText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![ClaimField::new(0, "osotnoc")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://futo.substack.com/",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let profile =
            fetch(browser_like_client().get(format!("https://{handle}.substack.com"))).await;
        if !profile.ok() {
            return Err(profile_fetch_error(
                "Unable to find your Substack account",
                &profile,
            ));
        }
        og_description(&profile.body).ok_or_else(|| {
            VerifierError::new(
                "Verifier encountered an error attempting to check your profile description",
                "Failed to find 'og:description' meta tag.",
            )
        })
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_og_description() {
        let html = r#"<head><meta property="og:description" content=" A &amp; B token "></head>"#;
        assert_eq!(og_description(html).as_deref(), Some("A & B token"));
        assert_eq!(og_description("<head></head>"), None);
    }

    #[tokio::test]
    async fn parses_profile_urls() {
        let fields = SubstackText
            .get_claim_fields_by_url("https://futo.substack.com/")
            .await
            .unwrap();
        assert_eq!(fields, vec![ClaimField::new(0, "futo")]);
    }
}
