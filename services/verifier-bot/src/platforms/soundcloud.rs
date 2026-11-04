use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{Fetched, browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

const USER_AGENT_DESKTOP: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";
const USER_AGENT_MOBILE: &str = "Mozilla/5.0 (Linux; Android 10; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?soundcloud\.com/([^/]+)/?").unwrap());
static HYDRATION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"window\.__sc_hydration = (.+);").unwrap());
static CLIENT_ID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#""clientId":"([a-zA-Z0-9-_]+)""#).unwrap());

/// Key 0 is the username (from the profile page), key 1 the internal user
/// id (from the API).
struct SoundCloudText;

pub fn verifier() -> Verifier {
    Verifier::text("SoundCloud", SoundCloudText)
}

async fn call(client: &reqwest::Client, url: &str, mobile: bool) -> Fetched {
    let user_agent = if mobile {
        USER_AGENT_MOBILE
    } else {
        USER_AGENT_DESKTOP
    };
    fetch(client.get(url).header("User-Agent", user_agent)).await
}

fn hydration_error(detail: &str) -> VerifierError {
    VerifierError::new("SoundCloud profile page error", detail)
}

/// The `user` object the profile page hydrates from.
fn hydrated_user(html: &str) -> VResult<serde_json::Value> {
    let Some(captures) = HYDRATION.captures(html) else {
        return Err(hydration_error(
            "SoundCloud page has hydrated differently than expected. Failed to match window.__sc_hydration",
        ));
    };
    let json: serde_json::Value = serde_json::from_str(&captures[1])
        .map_err(|e| hydration_error(&format!("Failed to parse window.__sc_hydration: {e}")))?;
    json.as_array()
        .into_iter()
        .flatten()
        .find(|o| o.get("hydratable").and_then(|h| h.as_str()) == Some("user"))
        .and_then(|o| o.get("data").cloned())
        .ok_or_else(|| hydration_error("User object not found in window.__sc_hydration"))
}

impl SoundCloudText {
    async fn text_from_username(&self, username: &str) -> VResult<String> {
        let url = format!("https://soundcloud.com/{username}");
        let profile = call(&browser_like_client(), &url, false).await;
        if !profile.ok() {
            return Err(VerifierError::new(
                "Unable to find your SoundCloud account",
                format!(
                    "Failed to get Profile page ({}): '{}' on url '{url}'.",
                    profile.status, profile.status_text
                ),
            ));
        }
        let user = hydrated_user(&profile.body)?;
        Ok(user
            .get("description")
            .and_then(|d| d.as_str())
            .unwrap_or_default()
            .to_string())
    }

    async fn text_from_internal_id(&self, id: &str) -> VResult<String> {
        let client = browser_like_client();
        let home = call(&client, "https://soundcloud.com/discover", true).await;
        if !home.ok() {
            return Err(VerifierError::new(
                "Failed to get home page",
                format!(
                    "Failed to get home page ({}): '{}'.",
                    home.status, home.status_text
                ),
            ));
        }
        let Some(client_id) = CLIENT_ID.captures(&home.body).map(|c| c[1].to_string()) else {
            return Err(VerifierError::msg("Failed to find client id"));
        };

        let api_url = format!("https://api-v2.soundcloud.com/users/{id}?client_id={client_id}");
        let profile = call(&client, &api_url, true).await;
        if !profile.ok() {
            return Err(VerifierError::new(
                "Unable to find your SoundCloud account",
                format!(
                    "Failed to get API profile page ({}): '{}' on URL ('{api_url}').",
                    profile.status, profile.status_text
                ),
            ));
        }
        profile
            .json()
            .get("description")
            .and_then(|d| d.as_str())
            .filter(|d| !d.is_empty())
            .map(String::from)
            .ok_or_else(|| VerifierError::msg("Failed to get description."))
    }
}

#[async_trait]
impl TextPlatform for SoundCloudText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business with its headquarters in Waitangi. The company is a manufacturing, sales, and support organization",
            claim_fields: vec![
                ClaimField::new(0, "osotnoc"),
                ClaimField::new(1, "1282027346"),
            ],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://soundcloud.com/osotnoc",
            expected_claim_fields: vec![
                ClaimField::new(0, "osotnoc"),
                ClaimField::new(1, "1282027346"),
            ],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        match field.key {
            0 => self.text_from_username(&field.value).await,
            1 => self.text_from_internal_id(&field.value).await,
            key => Err(VerifierError::invalid_field(key)),
        }
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        let Some(username) = URL.captures(url).map(|c| c[1].to_string()) else {
            return Err(VerifierError::msg("Failed to match regex"));
        };
        let profile_url = format!("https://soundcloud.com/{username}");
        let profile = call(&browser_like_client(), &profile_url, false).await;
        if !profile.ok() {
            return Err(VerifierError::msg(format!(
                "Failed to get profile on url '{profile_url}'."
            )));
        }
        let user = hydrated_user(&profile.body)?;
        let internal_id = match user.get("id") {
            Some(serde_json::Value::Number(n)) => n.to_string(),
            Some(serde_json::Value::String(s)) if !s.is_empty() => s.clone(),
            _ => {
                return Err(hydration_error(
                    "SoundCloud page did not contain internal id",
                ));
            }
        };
        Ok(vec![
            ClaimField::new(0, username),
            ClaimField::new(1, internal_id),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_hydrated_user() {
        let html = r#"<script>window.__sc_hydration = [{"hydratable":"anonymousId","data":"x"},{"hydratable":"user","data":{"id":1282027346,"description":"bio token"}}];</script>"#;
        let user = hydrated_user(html).unwrap();
        assert_eq!(user["description"], "bio token");
        assert_eq!(user["id"].to_string(), "1282027346");
        assert!(hydrated_user("<html></html>").is_err());
    }
}
