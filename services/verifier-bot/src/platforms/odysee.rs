use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;
use serde_json::json;

use crate::claims::ClaimField;
use crate::error::{VResult, VerifierError};
use crate::util::{Fetched, browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static LBRY_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"lbry://([^/\n\r:#]+)").unwrap());
static ODYSEE_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?odysee\.com/([^/\n\r:#]+)").unwrap());

const API: &str = "https://api.na-backend.odysee.com/api/v1/proxy";

/// Key 0 is the channel name (`@name`), key 1 the channel's claim id.
struct OdyseeText;

pub fn verifier() -> Verifier {
    Verifier::text("Odysee", OdyseeText)
}

async fn rpc(method: &str, params: serde_json::Value) -> Fetched {
    let body = json!({ "jsonrpc": "2.0", "method": method, "params": params });
    fetch(
        browser_like_client()
            .post(format!("{API}?m={method}"))
            .json(&body),
    )
    .await
}

fn account_error(detail: String) -> VerifierError {
    VerifierError::new("Unable to find your account", detail)
}

fn status_error(fetched: &Fetched) -> VerifierError {
    account_error(format!(
        "Failed to get Profile page ({}): '{}'.",
        fetched.status, fetched.status_text
    ))
}

/// The response body, unless the request didn't get through.
fn checked(fetched: Fetched) -> VResult<serde_json::Value> {
    if fetched.status == 0 {
        return Err(VerifierError::new(
            "Error connecting to Odysee",
            format!("Error during API call: {}", fetched.status_text),
        ));
    }
    if !fetched.ok() {
        return Err(status_error(&fetched));
    }
    Ok(fetched.json())
}

impl OdyseeText {
    async fn text_from_name(&self, id: &str) -> VResult<String> {
        let lbry_id = if id.starts_with('@') {
            format!("lbry://{id}")
        } else {
            format!("lbry://@{id}")
        };
        let data = checked(rpc("resolve", json!({ "urls": [lbry_id] })).await)?;
        let Some(channel) = data
            .get("result")
            .and_then(|r| r.get(&lbry_id))
            .filter(|c| !c.is_null())
        else {
            return Err(VerifierError::new(
                "Invalid response data",
                format!("No data returned for {lbry_id}"),
            ));
        };
        match channel.pointer("/value/description") {
            Some(serde_json::Value::String(d)) => Ok(d.clone()),
            Some(serde_json::Value::Null) | None => Err(VerifierError::new(
                "No description found",
                format!("Channel {id} does not have a description"),
            )),
            Some(other) => Ok(other.to_string()),
        }
    }

    async fn text_from_claim_id(&self, id: &str) -> VResult<String> {
        let data = checked(rpc("claim_search", json!({ "claim_ids": [id] })).await)?;
        if let Some(error) = data.get("error").filter(|e| !e.is_null()) {
            return Err(account_error(format!(
                "Odysee claim_search returned an error for {id}: {error}"
            )));
        }
        let Some(item) = data.pointer("/result/items/0").filter(|i| !i.is_null()) else {
            return Err(account_error(format!("No claim found for {id}")));
        };
        item.pointer("/value/description")
            .and_then(|d| d.as_str())
            .map(|d| d.trim().to_string())
            .ok_or_else(|| {
                VerifierError::new(
                    "No description found",
                    format!("Claim {id} does not have a description"),
                )
            })
    }
}

/// The channel name a `lbry://` or odysee.com URL names.
fn channel_name(url: &str) -> Option<String> {
    let re = if url.starts_with("lbry://") {
        &LBRY_URL
    } else {
        &ODYSEE_URL
    };
    re.captures(url).map(|c| c[1].to_string())
}

#[async_trait]
impl TextPlatform for OdyseeText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        // Both claim types resolve the same channel, by name and by claim id.
        vec![
            VerificationFixture {
                expected_text: "The only Kino Youtuber.",
                claim_fields: vec![ClaimField::new(0, "@TheKinoCorner")],
            },
            VerificationFixture {
                expected_text: "The only Kino Youtuber.",
                claim_fields: vec![ClaimField::new(
                    1,
                    "273163260bceb95fa98d97d33d377c55395e329a",
                )],
            },
        ]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        [
            "https://odysee.com/@TheKinoCorner:2",
            "lbry://@TheKinoCorner:2",
            "https://odysee.com/@TheKinoCorner",
            "lbry://@TheKinoCorner",
            "lbry://@TheKinoCorner#273163260bceb95fa98d97d33d377c55395e329a",
            "lbry://@TheKinoCorner:2#273163260bceb95fa98d97d33d377c55395e329a",
        ]
        .into_iter()
        .map(|url| UrlFixture {
            url,
            expected_claim_fields: vec![
                ClaimField::new(0, "@TheKinoCorner"),
                ClaimField::new(1, "273163260bceb95fa98d97d33d377c55395e329a"),
            ],
        })
        .collect()
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        match field.key {
            0 => self.text_from_name(&field.value).await,
            1 => self.text_from_claim_id(&field.value).await,
            key => Err(VerifierError::invalid_field(key)),
        }
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        let Some(id) = channel_name(url) else {
            return Err(VerifierError::msg("Failed to match regex"));
        };
        let lbry_id = format!("lbry://{id}");
        let fetched = rpc("resolve", json!({ "urls": [lbry_id] })).await;
        if !fetched.ok() {
            return Err(status_error(&fetched));
        }
        let data = fetched.json();
        let Some(claim_id) = data
            .get("result")
            .and_then(|r| r.get(&lbry_id))
            .and_then(|c| c.get("claim_id"))
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
        else {
            return Err(VerifierError::new(
                "Failed to get claim_id.",
                data.to_string(),
            ));
        };
        Ok(vec![ClaimField::new(0, id), ClaimField::new(1, claim_id)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_names() {
        for url in [
            "https://odysee.com/@TheKinoCorner:2",
            "lbry://@TheKinoCorner:2",
            "https://www.odysee.com/@TheKinoCorner",
            "lbry://@TheKinoCorner#273163260bceb95fa98d97d33d377c55395e329a",
        ] {
            assert_eq!(
                channel_name(url).as_deref(),
                Some("@TheKinoCorner"),
                "{url}"
            );
        }
        assert_eq!(channel_name("https://youtube.com/@x"), None);
    }
}
