use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use axum::http::StatusCode;
use serde::Serialize;

use super::{configured, data_str, decode_challenge, single_account};
use crate::claims::ClaimField;
use crate::config::{Config, OAuthCredentials};
use crate::error::{VResult, VerifierError};
use crate::util::{
    browser_like_client, callback_for_platform, encode_object, encode_uri_component, fetch,
    http_response_to_error, random_token,
};
use crate::verifier::{OAuthPlatform, OAuthUrl, TokenResponse, Verifier};

const PLATFORM: &str = "Discord";

/// Remembered usernames are dropped wholesale past this many.
const USERNAME_CACHE_LIMIT: usize = 10_000;

#[derive(Serialize)]
struct DiscordToken<'a> {
    token: &'a str,
}

struct DiscordOAuth {
    credentials: OAuthCredentials,
    callback_domain: Option<String>,
    /// Username by authorization code, so a client retrying the token
    /// exchange with an already-used code still learns its username.
    usernames: Mutex<HashMap<String, String>>,
}

pub fn verifier(config: &Config) -> Verifier {
    Verifier::oauth(
        PLATFORM,
        DiscordOAuth {
            credentials: config.discord.clone(),
            callback_domain: config.oauth_callback_domain.clone(),
            usernames: Mutex::new(HashMap::new()),
        },
    )
}

/// `name#1234` for legacy accounts, `name` for migrated ones.
fn username_of(user: &serde_json::Value) -> String {
    let name = user
        .get("username")
        .and_then(|u| u.as_str())
        .unwrap_or_default();
    match user.get("discriminator").and_then(|d| d.as_str()) {
        Some(d) if d != "0" => format!("{name}#{d}"),
        _ => name.to_string(),
    }
}

#[async_trait]
impl OAuthPlatform for DiscordOAuth {
    async fn oauth_url(&self) -> VResult<OAuthUrl> {
        let client_id = configured(&self.credentials.client_id)?;
        let domain = configured(&self.callback_domain)?;
        let redirect_uri = encode_uri_component(&callback_for_platform(domain, PLATFORM));
        let state = serde_json::json!({ "harborSecret": random_token() }).to_string();
        Ok(OAuthUrl::OAuth2(format!(
            "https://discord.com/api/oauth2/authorize?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope=identify&state={}",
            encode_uri_component(&state)
        )))
    }

    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse> {
        let client_id = configured(&self.credentials.client_id)?;
        let client_secret = configured(&self.credentials.client_secret)?;
        let domain = configured(&self.callback_domain)?;
        let Some(code) = data_str(data, "code") else {
            return Err(VerifierError::new(
                "Missing required OAuth parameters",
                "The code parameter is required for Discord OAuth",
            ));
        };

        let client = browser_like_client();
        let redirect_uri = callback_for_platform(domain, PLATFORM);
        let response = fetch(client.post("https://discord.com/api/oauth2/token").form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
            ("code", code),
        ]))
        .await;
        if response.status == 0 {
            return Err(VerifierError::new(
                "Discord authentication failed",
                response.status_text,
            ));
        }
        let body = response.json();
        if !(200..300).contains(&response.status) {
            if body.get("error").and_then(|e| e.as_str()) == Some("invalid_grant") {
                let cached = self.usernames.lock().unwrap().get(code).cloned();
                return match cached {
                    Some(username) => Ok(TokenResponse {
                        username,
                        token: encode_object(&DiscordToken {
                            token: "cached_token",
                        }),
                    }),
                    None => Err(VerifierError::new(
                        "Discord authorization code has expired or already been used",
                        "Please try the verification process again",
                    )),
                };
            }
            return Err(http_response_to_error(
                response.status,
                &response.body,
                "Discord API token endpoint",
            ));
        }
        let Some(token) = data_str(&body, "access_token") else {
            return Err(VerifierError::new(
                "Failed to obtain access token",
                "Discord did not return an access token",
            ));
        };

        let me = fetch(
            client
                .get("https://discord.com/api/users/@me")
                .bearer_auth(token),
        )
        .await;
        if !me.ok() {
            return Err(http_response_to_error(
                me.status,
                &me.body,
                "Discord API /users/@me",
            ));
        }
        let username = username_of(&me.json());
        {
            let mut usernames = self.usernames.lock().unwrap();
            if usernames.len() >= USERNAME_CACHE_LIMIT {
                usernames.clear();
            }
            usernames.insert(code.to_string(), username.clone());
        }
        Ok(TokenResponse {
            username,
            token: encode_object(&DiscordToken { token }),
        })
    }

    async fn is_token_valid(
        &self,
        challenge_response: &str,
        claim_fields: &[ClaimField],
    ) -> VResult<()> {
        let expected = single_account(claim_fields)?;
        let Ok(payload) = decode_challenge(challenge_response) else {
            return Err(VerifierError::msg(
                "Invalid token data format for Discord verification.",
            ));
        };
        let Some(token) = data_str(&payload, "token") else {
            return Err(VerifierError::msg(
                "Incomplete token data for Discord verification.",
            ));
        };

        let me = fetch(
            browser_like_client()
                .get("https://discord.com/api/users/@me")
                .bearer_auth(token),
        )
        .await;
        match me.status {
            0 => {
                return Err(VerifierError::new(
                    "Failed to verify Discord account via API",
                    me.status_text,
                ));
            }
            401 => {
                return Err(VerifierError::new(
                    "Discord token is invalid or expired.",
                    "Discord rejected the access token during validation.",
                )
                .with_status(StatusCode::UNAUTHORIZED));
            }
            200..300 => {}
            status => {
                return Err(http_response_to_error(
                    status,
                    &me.body,
                    "Discord API /users/@me Verification",
                ));
            }
        }
        let actual = username_of(&me.json());
        if expected.to_lowercase() != actual.to_lowercase() {
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
                "Verifier not configured: Missing Discord credentials",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usernames() {
        let user = |v: serde_json::Value| username_of(&v);
        assert_eq!(
            user(serde_json::json!({"username": "a", "discriminator": "0"})),
            "a"
        );
        assert_eq!(
            user(serde_json::json!({"username": "a", "discriminator": "1234"})),
            "a#1234"
        );
        assert_eq!(user(serde_json::json!({"username": "a"})), "a");
    }

    #[tokio::test]
    async fn oauth_url_carries_a_json_state() {
        let mut config = Config::for_tests();
        config.discord.client_id = Some("123".into());
        config.oauth_callback_domain = Some("https://bot.example".into());
        let verifier = verifier(&config);
        let crate::verifier::VerifierKind::OAuth(oauth) = &verifier.kind else {
            unreachable!()
        };
        let OAuthUrl::OAuth2(url) = oauth.oauth_url().await.unwrap() else {
            panic!("expected OAuth2");
        };
        assert!(url.starts_with("https://discord.com/api/oauth2/authorize?client_id=123&redirect_uri=https%3A%2F%2Fbot.example%2Fplatforms%2Fdiscord%2Foauth%2Fcallback&response_type=code&scope=identify&state=%7B%22harborSecret%22%3A%22"), "{url}");
    }

    #[tokio::test]
    async fn unconfigured() {
        let verifier = verifier(&Config::for_tests());
        let crate::verifier::VerifierKind::OAuth(oauth) = &verifier.kind else {
            unreachable!()
        };
        assert_eq!(
            oauth.oauth_url().await.unwrap_err().message,
            "Verifier not configured"
        );
        assert!(oauth.health_check().await.is_err());
    }
}
