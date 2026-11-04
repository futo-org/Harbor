use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use super::{require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?vimeo\.com/([^/]+)/?").unwrap());

struct VimeoText;

pub fn verifier() -> Verifier {
    Verifier::text("Vimeo", VimeoText)
}

#[async_trait]
impl TextPlatform for VimeoText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![ClaimField::new(0, "osotnoc")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://vimeo.com/futo",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let client = browser_like_client();
        // The web player's anonymous JWT authorizes API reads.
        let viewer = fetch(client.get("https://vimeo.com/_next/viewer"))
            .await
            .json();
        let Some(jwt) = viewer
            .get("jwt")
            .and_then(|j| j.as_str())
            .filter(|j| !j.is_empty())
        else {
            return Err(VerifierError::msg(
                "Unable to retrieve Vimeo JWT for request authorization",
            ));
        };

        let user = fetch(
            client
                .get(format!(
                    "https://api.vimeo.com/users/{handle}?fields=bio&fetch_user_profile=1"
                ))
                .header("Authorization", format!("jwt {jwt}")),
        )
        .await
        .json();
        user.get("bio")
            .and_then(|b| b.as_str())
            .filter(|b| !b.is_empty())
            .map(String::from)
            .ok_or_else(|| VerifierError::msg("Unable to retrieve user bio from Vimeo"))
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}
