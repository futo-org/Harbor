use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use super::{json_text, profile_fetch_error, require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::VResult;
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?github\.com/([^/]+)/?").unwrap());

struct GithubText;

pub fn verifier() -> Verifier {
    Verifier::text("GitHub", GithubText)
}

#[async_trait]
impl TextPlatform for GithubText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![ClaimField::new(0, "osotnoc-corp")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://github.com/futo-org",
            expected_claim_fields: vec![ClaimField::new(0, "futo-org")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let profile =
            fetch(browser_like_client().get(format!("https://api.github.com/users/{handle}")))
                .await;
        if !profile.ok() {
            return Err(profile_fetch_error("Unable to find your account", &profile));
        }
        Ok(json_text(&profile.json(), "/bio").trim().to_string())
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn parses_profile_urls() {
        let fields = GithubText
            .get_claim_fields_by_url("https://www.github.com/futo-org/repo")
            .await
            .unwrap();
        assert_eq!(fields, vec![ClaimField::new(0, "futo-org")]);
        assert!(
            GithubText
                .get_claim_fields_by_url("https://gitlab.com/x")
                .await
                .is_err()
        );
    }
}
