use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;
use serde_json::json;

use super::{require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?twitch\.tv/([^/]+)/?").unwrap());
static CLIENT_ID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"clientId\s*=\s*"(\w+)""#).unwrap());

/// Persisted GraphQL query behind a channel's About panel.
const ABOUT_PANEL_QUERY_HASH: &str =
    "6089531acef6c09ece01b440c41978f4c8dc60cb4fa0124c9a9d3f896709b6c6";

struct TwitchText;

pub fn verifier() -> Verifier {
    Verifier::text("Twitch", TwitchText)
}

#[async_trait]
impl TextPlatform for TwitchText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![ClaimField::new(0, "osotnoc")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://www.twitch.tv/futo/",
            expected_claim_fields: vec![ClaimField::new(0, "futo")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let login = require_handle(field)?;
        let client = browser_like_client();
        let home = fetch(client.get("https://www.twitch.tv/")).await;
        if !home.ok() {
            return Err(VerifierError::msg("Failed to get home page."));
        }
        let Some(client_id) = CLIENT_ID.captures(&home.body).map(|c| c[1].to_string()) else {
            return Err(VerifierError::msg("Failed to get client id."));
        };

        // Twitch rejects a request that carries both the query and the hash
        // of a persisted one, so send the hash alone.
        let body = json!({
            "operationName": "ChannelRoot_AboutPanel",
            "variables": { "channelLogin": login, "skipSchedule": true },
            "extensions": {
                "persistedQuery": { "version": 1, "sha256Hash": ABOUT_PANEL_QUERY_HASH }
            },
        });
        let response = fetch(
            client
                .post("https://gql.twitch.tv/gql")
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                )
                .header("Client-Id", client_id)
                .json(&body),
        )
        .await;
        if !response.ok() {
            return Err(VerifierError::msg(format!(
                "Get about pannel request returned (status = {}, status_text = {}, response = {}).",
                response.status, response.status_text, response.body
            )));
        }

        let data = response.json();
        let Some(user) = data.pointer("/data/user").filter(|u| !u.is_null()) else {
            return Err(VerifierError::msg(
                "Unable to retrieve user data from Twitch",
            ));
        };
        Ok(user
            .get("description")
            .and_then(|d| d.as_str())
            .unwrap_or_default()
            .to_string())
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}
