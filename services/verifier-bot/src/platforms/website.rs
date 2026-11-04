use async_trait::async_trait;

use super::require_handle;
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

/// Any web page: the token must appear somewhere in its HTML.
struct WebsiteText;

pub fn verifier() -> Verifier {
    Verifier::text("Website", WebsiteText)
}

#[async_trait]
impl TextPlatform for WebsiteText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        // Any page will do; this one is ours and the title is stable.
        vec![VerificationFixture {
            expected_text: "FUTO - Computers Belong to You",
            claim_fields: vec![ClaimField::new(0, "https://futo.org/")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://futo.org/",
            expected_claim_fields: vec![ClaimField::new(0, "https://futo.org/")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        // TODO: this should probably be more like a domain claim (a DNS TXT
        // record on the host).
        let url = require_handle(field)?;
        let page = fetch(browser_like_client().get(url)).await;
        if !page.ok() {
            return Err(VerifierError::msg(format!(
                "Failed to retrieve website from URL {url}"
            )));
        }
        Ok(page.body)
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        Ok(vec![ClaimField::new(0, url)])
    }
}
