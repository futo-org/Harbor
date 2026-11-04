use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use super::{json_text, profile_fetch_error, require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::VResult;
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?nebula\.tv/([^/]+)/?").unwrap());

struct NebulaText;

pub fn verifier() -> Verifier {
    Verifier::text("Nebula", NebulaText)
}

#[async_trait]
impl TextPlatform for NebulaText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "A closer look at our awesome universe. Videos about science, humanities, and everything I find fascinating.",
            claim_fields: vec![ClaimField::new(0, "technicality")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://nebula.tv/futo",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let profile = fetch(
            browser_like_client().get(format!("https://content.api.nebula.app/content/{handle}/")),
        )
        .await;
        if !profile.ok() {
            return Err(profile_fetch_error("Unable to find your account", &profile));
        }
        Ok(json_text(&profile.json(), "/description")
            .trim()
            .to_string())
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}
