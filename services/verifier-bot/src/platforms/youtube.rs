use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{Fetched, fetch, plain_client};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static CHANNEL_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?youtube\.com/channel/([^/]+)/?").unwrap());
static HANDLE_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?youtube\.com/(@[^/]+)/?").unwrap());
static DESCRIPTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<meta property="og:description" content="([^"]+)">"#).unwrap());
static OG_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<meta property="og:url" content="([^"]+)">"#).unwrap());
static ORIGINAL_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#""originalUrl":"([^"]+)""#).unwrap());

/// Key 0 is the `@handle`, key 1 the `UC…` channel id.
struct YoutubeText;

pub fn verifier() -> Verifier {
    Verifier::text("YouTube", YoutubeText)
}

/// YouTube was always fetched without a browser user agent or cookies;
/// keep it that way, its consent and bot pages key off both.
async fn get(url: &str) -> Fetched {
    fetch(plain_client().get(url).header("User-Agent", "node")).await
}

fn capture(re: &Regex, text: &str) -> Option<String> {
    re.captures(text).map(|c| c[1].to_string())
}

/// The About page a claim field points at.
fn about_url(field: &ClaimField) -> VResult<String> {
    match field.key {
        0 => {
            // A full URL or a bare handle, with or without the @.
            let handle = capture(&HANDLE_URL, &field.value).unwrap_or_else(|| field.value.clone());
            let handle = if handle.starts_with('@') {
                handle
            } else {
                format!("@{handle}")
            };
            Ok(format!("https://www.youtube.com/{handle}/about"))
        }
        1 => {
            let channel =
                capture(&CHANNEL_URL, &field.value).unwrap_or_else(|| field.value.clone());
            Ok(format!("https://www.youtube.com/channel/{channel}/about"))
        }
        key => Err(VerifierError::invalid_field(key)),
    }
}

impl YoutubeText {
    async fn claim_fields_by_handle(&self, handle: &str) -> VResult<Vec<ClaimField>> {
        let handle_field = ClaimField::new(0, handle);
        let url = format!("https://www.youtube.com/{handle}");
        let page = get(&url).await;
        if !page.ok() {
            return Err(VerifierError::msg(format!(
                "Failed to get channel page from '{url}'."
            )));
        }
        let channel = capture(&OG_URL, &page.body)
            .and_then(|og_url| capture(&CHANNEL_URL, &og_url))
            .filter(|c| !c.is_empty());
        Ok(match channel {
            Some(channel) => vec![handle_field, ClaimField::new(1, channel)],
            None => vec![handle_field],
        })
    }

    async fn claim_fields_by_channel(&self, channel: &str) -> VResult<Vec<ClaimField>> {
        let channel_field = ClaimField::new(1, channel);
        let url = format!("https://www.youtube.com/channel/{channel}");
        let page = get(&url).await;
        if !page.ok() {
            return Err(VerifierError::msg(format!(
                "Failed to get channel page from '{url}'."
            )));
        }
        let handle = capture(&ORIGINAL_URL, &page.body)
            .and_then(|original| capture(&HANDLE_URL, &original))
            .filter(|h| h.starts_with('@'));
        Ok(match handle {
            Some(handle) => vec![ClaimField::new(0, handle), channel_field],
            None => vec![channel_field],
        })
    }
}

#[async_trait]
impl TextPlatform for YoutubeText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "Hv2o+4ruwg9ZL1dKdh/ezp2bPENyVFRccqavfZwCUs0=",
            claim_fields: vec![
                ClaimField::new(0, "@koen-futo"),
                ClaimField::new(1, "UCR7KMD7jkSefYYWgSwNPEBA"),
            ],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        let both = vec![
            ClaimField::new(0, "@koen-futo"),
            ClaimField::new(1, "UCR7KMD7jkSefYYWgSwNPEBA"),
        ];
        vec![
            UrlFixture {
                url: "https://www.youtube.com/@koen-futo",
                expected_claim_fields: both.clone(),
            },
            UrlFixture {
                url: "https://www.youtube.com/channel/UCR7KMD7jkSefYYWgSwNPEBA",
                expected_claim_fields: both,
            },
        ]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let url = about_url(field)?;
        let page = get(&url).await;
        if !(200..300).contains(&page.status) {
            return Err(VerifierError::new(
                format!("Failed to fetch YouTube profile ({})", page.status),
                format!("Failed to fetch {url} - Status: {}", page.status),
            ));
        }
        capture(&DESCRIPTION, &page.body).ok_or_else(|| {
            VerifierError::new(
                "Could not find YouTube channel description",
                "Failed to find description meta tag in YouTube page.",
            )
        })
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        if let Some(channel) = capture(&CHANNEL_URL, url) {
            return self.claim_fields_by_channel(&channel).await;
        }
        if let Some(handle) = capture(&HANDLE_URL, url) {
            return self.claim_fields_by_handle(&handle).await;
        }
        Err(VerifierError::msg("Failed to match channel or user."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn about_urls() {
        let about = |key, value: &str| about_url(&ClaimField::new(key, value)).unwrap();
        assert_eq!(
            about(0, "@koen-futo"),
            "https://www.youtube.com/@koen-futo/about"
        );
        assert_eq!(
            about(0, "koen-futo"),
            "https://www.youtube.com/@koen-futo/about"
        );
        assert_eq!(
            about(0, "https://www.youtube.com/@koen-futo"),
            "https://www.youtube.com/@koen-futo/about"
        );
        assert_eq!(
            about(1, "https://youtube.com/channel/UCR7KMD7jkSefYYWgSwNPEBA/"),
            "https://www.youtube.com/channel/UCR7KMD7jkSefYYWgSwNPEBA/about"
        );
        assert!(about_url(&ClaimField::new(2, "x")).is_err());
    }
}
