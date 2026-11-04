use std::sync::{Arc, LazyLock};

use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{require_handle, single_capture};
use crate::browser::SharedBrowser;
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::text_content;
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?kick\.com/([^/]+)/?").unwrap());

/// Kick's bot protection blocks plain HTTP clients and vanilla headless
/// Chrome outright, so the channel API is read through the stealthed shared
/// browser.
struct KickText {
    browser: Arc<SharedBrowser>,
}

pub fn verifier(browser: Arc<SharedBrowser>) -> Verifier {
    Verifier::text("Kick", KickText { browser })
}

const UNKNOWN_ERROR: &str =
    "The verifier encountered unknown error occurred verifying your Kick account";

/// The bio in the channel API's JSON, as Chrome renders it in a page.
fn bio_from_page(html: &str) -> VResult<String> {
    let selector = Selector::parse("body").expect("valid selector");
    let document = Html::parse_document(html);
    let Some(body) = document.select(&selector).next() else {
        return Err(VerifierError::new(
            UNKNOWN_ERROR,
            format!(
                "Unable to extract body from HTML returned from the browser. HTML returned: {html}"
            ),
        ));
    };
    let content = text_content(body);
    let data: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    data.pointer("/user/bio")
        .and_then(|b| b.as_str())
        .map(String::from)
        .ok_or_else(|| {
            VerifierError::new(
                UNKNOWN_ERROR,
                format!("Unexpected response from Kick API: {content}"),
            )
        })
}

#[async_trait]
impl TextPlatform for KickText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![ClaimField::new(0, "osotnoc")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://kick.com/futo",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn init(&self) {
        self.browser.warm_up().await;
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let page = self
            .browser
            .load(&format!("https://kick.com/api/v2/channels/{handle}"))
            .await
            .map_err(|e| VerifierError::new(UNKNOWN_ERROR, e))?;
        bio_from_page(&page.html)
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_bio_from_the_rendered_json() {
        let html = r#"<html><head></head><body><pre>{"id":1,"user":{"bio":"my bio token"}}</pre><div class="json-formatter-container"></div></body></html>"#;
        assert_eq!(bio_from_page(html).unwrap(), "my bio token");
        let err = bio_from_page("<html><body><pre>Access denied</pre></body></html>").unwrap_err();
        assert!(err.extended_message.unwrap().contains("Access denied"));
    }
}
