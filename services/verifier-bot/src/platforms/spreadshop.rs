use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{profile_fetch_error, require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{browser_like_client, fetch, text_content};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?(.+)\.myspreadshop\.com/?").unwrap());

struct SpreadshopText;

pub fn verifier() -> Verifier {
    Verifier::text("Spreadshop", SpreadshopText)
}

/// The shop's About text.
fn about_text(html: &str) -> Option<String> {
    let selector = Selector::parse(".sprd-about-info__text").expect("valid selector");
    Html::parse_document(html)
        .select(&selector)
        .next()
        .map(text_content)
}

#[async_trait]
impl TextPlatform for SpreadshopText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://futo.myspreadshop.com/about",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let shop = require_handle(field)?;
        let profile =
            fetch(browser_like_client().get(format!("https://{shop}.myspreadshop.com/about")))
                .await;
        if !profile.ok() {
            return Err(profile_fetch_error(
                "Unable to find your Spreadshop account",
                &profile,
            ));
        }
        about_text(&profile.body).ok_or_else(|| {
            VerifierError::new(
                "Verifier was unable to check your profile due to an error",
                "Unable to find item with .sprd-about-info__text css class on webpage",
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
    fn reads_the_about_text() {
        let html = r#"<html><body><div class="sprd-about-info__text"><p>Hello</p> token</div></body></html>"#;
        assert_eq!(about_text(html).as_deref(), Some("Hello token"));
        assert_eq!(about_text("<html></html>"), None);
    }
}
