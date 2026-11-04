use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use super::{profile_fetch_error, require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?gitlab\.com/([^/]+)/?").unwrap());
static DESCRIPTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<meta content="([^"]+)" property="og:description">"#).unwrap());

struct GitlabText;

pub fn verifier() -> Verifier {
    Verifier::text("GitLab", GitlabText)
}

#[async_trait]
impl TextPlatform for GitlabText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "biobiobio",
            claim_fields: vec![ClaimField::new(0, "tazzz")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://gitlab.com/futo",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let profile =
            fetch(browser_like_client().get(format!("https://gitlab.com/{handle}"))).await;
        if !profile.ok() {
            return Err(profile_fetch_error("Unable to find your account", &profile));
        }
        DESCRIPTION
            .captures(&profile.body)
            .map(|c| c[1].to_string())
            .ok_or_else(|| {
                VerifierError::new(
                    "Verifier encountered an error attempting to check your profile description",
                    "Failed to find description meta tag.",
                )
            })
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}
