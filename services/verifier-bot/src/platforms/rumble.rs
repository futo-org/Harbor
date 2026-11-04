use std::sync::{Arc, LazyLock};

use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use crate::browser::SharedBrowser;
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::structured_text;
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static USER_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?rumble\.com/user/([^/]+)/?").unwrap());
static CHANNEL_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?rumble\.com/c/([^/]+)/?").unwrap());

/// Rumble answers plain HTTP requests from our hosts with 403, so pages are
/// loaded through the stealthed shared browser. Key 0 is a user, key 1 a
/// channel.
struct RumbleText {
    browser: Arc<SharedBrowser>,
}

pub fn verifier(browser: Arc<SharedBrowser>) -> Verifier {
    Verifier::text("Rumble", RumbleText { browser })
}

/// The About page's description, which is where the pairing token goes.
fn description(html: &str) -> Option<String> {
    let selector = Selector::parse(".channel-about--description").expect("valid selector");
    Html::parse_document(html)
        .select(&selector)
        .next()
        .map(|node| structured_text(node).trim().to_string())
}

impl RumbleText {
    async fn get_description(&self, url: &str) -> VResult<String> {
        let page = self.browser.load(url).await.map_err(VerifierError::msg)?;
        if page.status != Some(200) {
            return Err(VerifierError::new(
                "Unable to find your account",
                format!(
                    "Failed to get Profile page ({}): '{url}'.",
                    page.status
                        .map(|s| s.to_string())
                        .unwrap_or("undefined".into())
                ),
            ));
        }
        description(&page.html).ok_or_else(|| {
            VerifierError::new(
                "No description found on your About page.",
                format!("Failed to find node '.channel-about--description' on {url}"),
            )
        })
    }
}

#[async_trait]
impl TextPlatform for RumbleText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![
            VerificationFixture {
                expected_text: "8YTgkgK6jTImETJdUa+kd7HURgZrhKjLVDL6yp5ETik=",
                claim_fields: vec![ClaimField::new(1, "c-3366838")],
            },
            // User pages carry a description too, so the other claim type
            // needs an account that has one set.
            VerificationFixture {
                expected_text: "harbor.social/5640b24e53a3b1edb65360840aaf085373b23d4ff",
                claim_fields: vec![ClaimField::new(0, "mark_futo")],
            },
        ]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![
            UrlFixture {
                url: "https://rumble.com/user/futo",
                expected_claim_fields: vec![ClaimField::new(0, "futo")],
            },
            UrlFixture {
                url: "https://rumble.com/c/c-213123",
                expected_claim_fields: vec![ClaimField::new(1, "c-213123")],
            },
        ]
    }

    async fn init(&self) {
        self.browser.warm_up().await;
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        match field.key {
            0 => {
                self.get_description(&format!("https://rumble.com/user/{}/about", field.value))
                    .await
            }
            1 => {
                self.get_description(&format!("https://rumble.com/c/{}/about", field.value))
                    .await
            }
            key => Err(VerifierError::invalid_field(key)),
        }
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        if let Some(c) = USER_URL.captures(url) {
            return Ok(vec![ClaimField::new(0, &c[1])]);
        }
        if let Some(c) = CHANNEL_URL.captures(url) {
            return Ok(vec![ClaimField::new(1, &c[1])]);
        }
        Err(VerifierError::msg(
            "Failed to match either channel or user.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_about_description() {
        let html =
            r#"<div class="channel-about--description"><p>Hello</p><p>token  here</p></div>"#;
        assert_eq!(description(html).as_deref(), Some("Hello\ntoken here"));
        assert_eq!(description("<div></div>"), None);
    }

    #[tokio::test]
    async fn parses_user_and_channel_urls() {
        let rumble = RumbleText {
            browser: SharedBrowser::new(None),
        };
        assert_eq!(
            rumble
                .get_claim_fields_by_url("https://rumble.com/user/futo")
                .await
                .unwrap(),
            vec![ClaimField::new(0, "futo")]
        );
        assert_eq!(
            rumble
                .get_claim_fields_by_url("https://rumble.com/c/c-213123")
                .await
                .unwrap(),
            vec![ClaimField::new(1, "c-213123")]
        );
        assert!(
            rumble
                .get_claim_fields_by_url("https://rumble.com/v123")
                .await
                .is_err()
        );
    }
}
