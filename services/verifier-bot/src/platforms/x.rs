//! X (Twitter) sign-in over OAuth 1.0a, signed by hand: request token ->
//! user authorizes -> access token -> `account/verify_credentials`.

use std::collections::BTreeMap;

use async_trait::async_trait;
use axum::http::StatusCode;
use base64::Engine;
use hmac::{Hmac, KeyInit, Mac};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde::Serialize;

use super::{configured, data_str, decode_challenge, single_account};
use crate::claims::ClaimField;
use crate::config::{Config, OAuthCredentials};
use crate::error::{VResult, VerifierError};
use crate::util::{
    Fetched, callback_for_platform, encode_object, encode_uri_component, fetch,
    http_response_to_error, plain_client, random_token,
};
use crate::verifier::{OAuthPlatform, OAuthUrl, TokenResponse, Verifier};

const PLATFORM: &str = "X";
const REQUEST_TOKEN: &str = "https://api.x.com/oauth/request_token";
const ACCESS_TOKEN: &str = "https://api.x.com/oauth/access_token";
const VERIFY_CREDENTIALS: &str = "https://api.x.com/1.1/account/verify_credentials.json";

/// The token handed to the client (and sent back as the challenge response).
#[derive(Serialize)]
struct XToken<'a> {
    secret: &'a str,
    token: &'a str,
}

struct XOAuth {
    /// API key / secret.
    credentials: OAuthCredentials,
    callback_domain: Option<String>,
}

pub fn verifier(config: &Config) -> Verifier {
    Verifier::oauth(
        PLATFORM,
        XOAuth {
            credentials: config.x.clone(),
            callback_domain: config.oauth_callback_domain.clone(),
        },
    )
}

/// RFC 3986 unreserved characters are left alone; everything else is
/// escaped (OAuth 1.0a section 3.6).
const OAUTH_ENCODE: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

fn pct(s: &str) -> String {
    utf8_percent_encode(s, OAUTH_ENCODE).to_string()
}

/// The `Authorization: OAuth …` header for a request to `url` with `params`
/// (query and form parameters, which are signed too).
fn authorization(
    method: &str,
    url: &str,
    params: &[(&str, &str)],
    consumer: (&str, &str),
    token: Option<(&str, &str)>,
    nonce: &str,
    timestamp: &str,
) -> String {
    let mut oauth: BTreeMap<&str, &str> = BTreeMap::from([
        ("oauth_consumer_key", consumer.0),
        ("oauth_nonce", nonce),
        ("oauth_signature_method", "HMAC-SHA1"),
        ("oauth_timestamp", timestamp),
        ("oauth_version", "1.0"),
    ]);
    if let Some((token, _)) = token {
        oauth.insert("oauth_token", token);
    }

    let mut all: Vec<(String, String)> = oauth
        .iter()
        .map(|(k, v)| (pct(k), pct(v)))
        .chain(params.iter().map(|(k, v)| (pct(k), pct(v))))
        .collect();
    all.sort();
    let param_string = all
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    let base = format!("{method}&{}&{}", pct(url), pct(&param_string));
    let key = format!(
        "{}&{}",
        pct(consumer.1),
        pct(token.map(|t| t.1).unwrap_or_default())
    );
    let mut mac = Hmac::<sha1::Sha1>::new_from_slice(key.as_bytes()).expect("HMAC takes any key");
    mac.update(base.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());

    let mut header: Vec<String> = oauth
        .iter()
        .map(|(k, v)| format!("{}=\"{}\"", pct(k), pct(v)))
        .collect();
    header.push(format!("oauth_signature=\"{}\"", pct(&signature)));
    format!("OAuth {}", header.join(", "))
}

fn timestamp() -> String {
    (crate::util::unix_seconds() as u64).to_string()
}

impl XOAuth {
    fn consumer(&self) -> VResult<(&str, &str)> {
        Ok((
            configured(&self.credentials.client_id)?,
            configured(&self.credentials.client_secret)?,
        ))
    }

    /// A signed POST with form parameters.
    async fn post(
        &self,
        url: &str,
        form: &[(&str, &str)],
        token: Option<(&str, &str)>,
    ) -> VResult<Fetched> {
        let auth = authorization(
            "POST",
            url,
            form,
            self.consumer()?,
            token,
            &random_token(),
            &timestamp(),
        );
        Ok(fetch(
            plain_client()
                .post(url)
                .header("Authorization", auth)
                .form(form),
        )
        .await)
    }
}

/// An `application/x-www-form-urlencoded` response body.
fn form_fields(body: &str) -> BTreeMap<String, String> {
    url::form_urlencoded::parse(body.as_bytes())
        .into_owned()
        .collect()
}

#[async_trait]
impl OAuthPlatform for XOAuth {
    async fn oauth_url(&self) -> VResult<OAuthUrl> {
        self.consumer()?;
        let domain = configured(&self.callback_domain)?;
        let callback = callback_for_platform(domain, PLATFORM);
        let response = self
            .post(REQUEST_TOKEN, &[("oauth_callback", &callback)], None)
            .await?;
        if response.status == 0 {
            return Err(VerifierError::msg(format!(
                "Twitter API error: {}",
                response.status_text
            )));
        }
        if !(200..300).contains(&response.status) {
            return Err(http_response_to_error(
                response.status,
                &response.body,
                "X API Auth Link Generation",
            ));
        }
        let fields = form_fields(&response.body);
        if fields.get("oauth_callback_confirmed").map(String::as_str) != Some("true") {
            tracing::error!("OAuth callback not confirmed by Twitter/X API.");
            return Err(VerifierError::msg(
                "Failed to initiate OAuth flow: Callback not confirmed by provider.",
            ));
        }
        let token = fields.get("oauth_token").cloned().unwrap_or_default();
        let secret = fields
            .get("oauth_token_secret")
            .cloned()
            .unwrap_or_default();
        Ok(OAuthUrl::OAuth1 {
            url: format!(
                "https://api.x.com/oauth/authorize?oauth_token={}",
                encode_uri_component(&token)
            ),
            token,
            secret,
        })
    }

    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse> {
        self.consumer()?;
        let (Some(token), Some(verifier), Some(secret)) = (
            data_str(data, "oauth_token"),
            data_str(data, "oauth_verifier"),
            data_str(data, "secret"),
        ) else {
            tracing::error!("getToken called with missing OAuth data: {data}");
            return Err(VerifierError::msg(
                "Internal error: Missing required data for token exchange.",
            ));
        };

        let response = self
            .post(
                ACCESS_TOKEN,
                &[("oauth_token", token), ("oauth_verifier", verifier)],
                Some((token, secret)),
            )
            .await?;
        if response.status == 0 {
            return Err(VerifierError::new(
                "Failed to exchange OAuth token with X.",
                response.status_text,
            )
            .with_status(StatusCode::BAD_GATEWAY));
        }
        if !(200..300).contains(&response.status) {
            return Err(http_response_to_error(
                response.status,
                &response.body,
                "X API Login/Token Exchange",
            ));
        }
        let fields = form_fields(&response.body);
        let field = |k: &str| fields.get(k).map(String::as_str).unwrap_or_default();
        Ok(TokenResponse {
            username: field("screen_name").to_string(),
            token: encode_object(&XToken {
                secret: field("oauth_token_secret"),
                token: field("oauth_token"),
            }),
        })
    }

    async fn is_token_valid(
        &self,
        challenge_response: &str,
        claim_fields: &[ClaimField],
    ) -> VResult<()> {
        let consumer = self
            .consumer()
            .map_err(|_| VerifierError::msg("Verifier not configured: Missing X credentials"))?;
        let Ok(payload) = decode_challenge(challenge_response) else {
            return Err(VerifierError::msg(
                "Invalid token data format for X verification.",
            ));
        };
        let (Some(token), Some(secret)) =
            (data_str(&payload, "token"), data_str(&payload, "secret"))
        else {
            return Err(VerifierError::msg(
                "Incomplete token data for X verification.",
            ));
        };
        let expected = single_account(claim_fields)?;

        let query = [("tweet_mode", "extended")];
        let auth = authorization(
            "GET",
            VERIFY_CREDENTIALS,
            &query,
            consumer,
            Some((token, secret)),
            &random_token(),
            &timestamp(),
        );
        let response = fetch(
            plain_client()
                .get(VERIFY_CREDENTIALS)
                .query(&query)
                .header("Authorization", auth),
        )
        .await;
        if response.status == 0 {
            return Err(VerifierError::new(
                "Failed to verify X account",
                response.status_text,
            ));
        }
        if !(200..300).contains(&response.status) {
            return Err(http_response_to_error(
                response.status,
                &response.body,
                "X API Verification",
            ));
        }
        let actual = data_str(&response.json(), "screen_name")
            .unwrap_or_default()
            .to_string();
        if actual != expected {
            return Err(VerifierError::new(
                "The username didn't match the account you logged in with",
                format!("Username did not match (expected: {expected}, got: {actual})"),
            ));
        }
        Ok(())
    }

    async fn health_check(&self) -> VResult<()> {
        self.consumer()
            .map(|_| ())
            .map_err(|_| VerifierError::msg("Verifier not configured: Missing X credentials"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The worked example from Twitter's "Creating a signature" guide.
    #[test]
    fn signs_like_the_reference_example() {
        let header = authorization(
            "POST",
            "https://api.twitter.com/1.1/statuses/update.json",
            &[
                ("include_entities", "true"),
                (
                    "status",
                    "Hello Ladies + Gentlemen, a signed OAuth request!",
                ),
            ],
            (
                "xvz1evFS4wEEPTGEFPHBog",
                "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
            ),
            Some((
                "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
                "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
            )),
            "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
            "1318622958",
        );
        assert!(
            header.contains("oauth_signature=\"hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D\""),
            "{header}"
        );
        assert!(header.starts_with("OAuth oauth_consumer_key=\"xvz1evFS4wEEPTGEFPHBog\""));
    }

    #[test]
    fn parses_form_responses() {
        let fields =
            form_fields("oauth_token=a%2Bb&oauth_token_secret=s&oauth_callback_confirmed=true");
        assert_eq!(fields["oauth_token"], "a+b");
        assert_eq!(fields["oauth_callback_confirmed"], "true");
    }
}
