use async_trait::async_trait;
use axum::http::StatusCode;
use serde::Serialize;

use super::{ChallengeError, configured, data_str, decode_challenge, single_account};
use crate::claims::ClaimField;
use crate::config::{Config, OAuthCredentials};
use crate::error::{VResult, VerifierError};
use crate::util::{
    Fetched, callback_for_platform, encode_object, fetch, http_response_to_error, plain_client,
    random_token,
};
use crate::verifier::{OAuthPlatform, OAuthUrl, TokenResponse, Verifier};

const PLATFORM: &str = "Patreon";
const IDENTITY: &str = "https://www.patreon.com/api/oauth2/v2/identity";

/// The token handed to the client (and sent back as the challenge response).
#[derive(Serialize)]
struct PatreonToken {
    #[serde(skip_serializing_if = "Option::is_none")]
    access_token: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    refresh_token: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expires_in: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_type: Option<serde_json::Value>,
}

/// The claim's account is the creator's vanity name, or their user id when
/// they have none.
struct PatreonOAuth {
    credentials: OAuthCredentials,
    callback_domain: Option<String>,
}

pub fn verifier(config: &Config) -> Verifier {
    Verifier::oauth(
        PLATFORM,
        PatreonOAuth {
            credentials: config.patreon.clone(),
            callback_domain: config.oauth_callback_domain.clone(),
        },
    )
}

/// The identity response's vanity, else its id.
fn username_of(identity: &serde_json::Value) -> Option<String> {
    let data = identity.get("data")?;
    let vanity = data
        .pointer("/attributes/vanity")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty());
    match (vanity, data.get("id")) {
        (Some(v), _) => Some(v.to_string()),
        (None, Some(serde_json::Value::String(id))) if !id.is_empty() => Some(id.clone()),
        (None, Some(serde_json::Value::Number(id))) => Some(id.to_string()),
        _ => None,
    }
}

/// A failed token exchange or identity lookup, as the client sees it.
fn exchange_error(response: &Fetched) -> VerifierError {
    if response.status == 0 {
        return VerifierError::new(
            "Failed to exchange OAuth token with Patreon.",
            response.status_text.clone(),
        )
        .with_status(StatusCode::BAD_GATEWAY);
    }
    if response.json().get("error").and_then(|e| e.as_str()) == Some("invalid_grant") {
        return VerifierError::new(
            "Invalid or expired authorization code.",
            "Patreon rejected the authorization code. It might have expired or already been used.",
        )
        .with_status(StatusCode::BAD_REQUEST);
    }
    http_response_to_error(
        response.status,
        &response.body,
        "Patreon API Token Exchange",
    )
}

#[async_trait]
impl OAuthPlatform for PatreonOAuth {
    async fn oauth_url(&self) -> VResult<OAuthUrl> {
        let client_id = configured(&self.credentials.client_id)?;
        let domain = configured(&self.callback_domain)?;
        let mut url =
            url::Url::parse("https://www.patreon.com/oauth2/authorize").expect("valid URL");
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", &callback_for_platform(domain, PLATFORM))
            .append_pair("scope", "identity")
            .append_pair("state", &random_token());
        Ok(OAuthUrl::OAuth2(url.to_string()))
    }

    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse> {
        let client_id = configured(&self.credentials.client_id)?;
        let client_secret = configured(&self.credentials.client_secret)?;
        let domain = configured(&self.callback_domain)?;
        let Some(code) = data_str(data, "code") else {
            return Err(VerifierError::msg(
                "Internal error: Missing required code for token exchange.",
            ));
        };

        let client = plain_client();
        let redirect_uri = callback_for_platform(domain, PLATFORM);
        let token = fetch(
            client
                .post("https://www.patreon.com/api/oauth2/token")
                .form(&[
                    ("code", code),
                    ("grant_type", "authorization_code"),
                    ("client_id", client_id),
                    ("client_secret", client_secret),
                    ("redirect_uri", redirect_uri.as_str()),
                ]),
        )
        .await;
        if !(200..300).contains(&token.status) {
            return Err(exchange_error(&token));
        }
        let token = token.json();
        let access_token = data_str(&token, "access_token").unwrap_or_default();

        let identity = fetch(
            client
                .get(IDENTITY)
                .bearer_auth(access_token)
                .query(&[("fields[user]", "email,full_name,vanity")]),
        )
        .await;
        if !(200..300).contains(&identity.status) {
            return Err(exchange_error(&identity));
        }
        let Some(username) = username_of(&identity.json()) else {
            return Err(VerifierError::msg(
                "Failed to retrieve username from Patreon.",
            ));
        };

        let field = |key: &str| token.get(key).filter(|v| !v.is_null()).cloned();
        Ok(TokenResponse {
            username,
            token: encode_object(&PatreonToken {
                access_token: field("access_token"),
                refresh_token: field("refresh_token"),
                expires_in: field("expires_in"),
                scope: field("scope"),
                token_type: field("token_type"),
            }),
        })
    }

    async fn is_token_valid(
        &self,
        challenge_response: &str,
        claim_fields: &[ClaimField],
    ) -> VResult<()> {
        configured(&self.credentials.client_id)?;
        configured(&self.credentials.client_secret)?;
        let expected = single_account(claim_fields)?;
        let payload = match decode_challenge(challenge_response) {
            Ok(payload) => payload,
            Err(ChallengeError::Uri) => {
                return Err(VerifierError::new(
                    "Invalid token data format for Patreon verification.",
                    "URI malformed",
                ));
            }
            Err(ChallengeError::Json(e)) => {
                return Err(VerifierError::new(
                    "Invalid JSON format in Patreon token data.",
                    e.to_string(),
                ));
            }
        };
        let Some(access_token) = data_str(&payload, "access_token") else {
            return Err(VerifierError::msg(
                "Incomplete token data for Patreon verification.",
            ));
        };

        let identity = fetch(
            plain_client()
                .get(IDENTITY)
                .bearer_auth(access_token)
                .query(&[("fields[user]", "vanity")]),
        )
        .await;
        match identity.status {
            0 => {
                return Err(VerifierError::new(
                    "Failed to verify Patreon account",
                    identity.status_text,
                )
                .with_status(StatusCode::INTERNAL_SERVER_ERROR));
            }
            401 => {
                return Err(VerifierError::new(
                    "Patreon token is invalid or expired.",
                    "Patreon rejected the access token during validation.",
                )
                .with_status(StatusCode::UNAUTHORIZED));
            }
            200..300 => {}
            status => {
                return Err(http_response_to_error(
                    status,
                    &identity.body,
                    "Patreon API Verification",
                ));
            }
        }
        let Some(actual) = username_of(&identity.json()) else {
            return Err(VerifierError::msg(
                "Failed to retrieve username from Patreon during validation.",
            ));
        };
        if actual.to_lowercase() != expected.to_lowercase() {
            return Err(VerifierError::new(
                "The username didn't match the account you logged in with",
                format!("Username mismatch (expected: {expected}, got: {actual})"),
            ));
        }
        Ok(())
    }

    async fn health_check(&self) -> VResult<()> {
        if self.credentials.client_id.is_none() || self.credentials.client_secret.is_none() {
            return Err(VerifierError::msg(
                "Verifier not configured: Missing Patreon credentials",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usernames_prefer_vanity() {
        let u = |v| username_of(&v);
        assert_eq!(
            u(serde_json::json!({"data": {"id": "42", "attributes": {"vanity": "futo"}}})),
            Some("futo".into())
        );
        assert_eq!(
            u(serde_json::json!({"data": {"id": "42", "attributes": {"vanity": null}}})),
            Some("42".into())
        );
        assert_eq!(u(serde_json::json!({})), None);
    }
}
