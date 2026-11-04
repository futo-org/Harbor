use async_trait::async_trait;

use super::{configured, data_str, single_account};
use crate::claims::ClaimField;
use crate::config::{Config, OAuthCredentials};
use crate::error::{VResult, VerifierError};
use crate::util::{
    browser_like_client, callback_for_platform, encode_uri_component, fetch, http_response_to_error,
};
use crate::verifier::{OAuthPlatform, OAuthUrl, TokenResponse, Verifier};

const PLATFORM: &str = "Spotify";
const ME: &str = "https://api.spotify.com/v1/me";

/// The challenge response is the Spotify access token itself; the claim's
/// account is the user's display name.
struct SpotifyOAuth {
    credentials: OAuthCredentials,
    callback_domain: Option<String>,
}

pub fn verifier(config: &Config) -> Verifier {
    Verifier::oauth(
        PLATFORM,
        SpotifyOAuth {
            credentials: config.spotify.clone(),
            callback_domain: config.oauth_callback_domain.clone(),
        },
    )
}

#[async_trait]
impl OAuthPlatform for SpotifyOAuth {
    async fn oauth_url(&self) -> VResult<OAuthUrl> {
        let client_id = configured(&self.credentials.client_id)?;
        let domain = configured(&self.callback_domain)?;
        let redirect_uri = encode_uri_component(&callback_for_platform(domain, PLATFORM));
        Ok(OAuthUrl::OAuth2(format!(
            "https://accounts.spotify.com/authorize?response_type=code&client_id={}&redirect_uri={redirect_uri}",
            encode_uri_component(client_id)
        )))
    }

    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse> {
        let client_id = configured(&self.credentials.client_id)?;
        let client_secret = configured(&self.credentials.client_secret)?;
        let domain = configured(&self.callback_domain)?;
        let code = data_str(data, "code").unwrap_or_default();

        let client = browser_like_client();
        let redirect_uri = callback_for_platform(domain, PLATFORM);
        let token = fetch(
            client
                .post("https://accounts.spotify.com/api/token")
                .basic_auth(client_id, Some(client_secret))
                .form(&[
                    ("code", code),
                    ("redirect_uri", redirect_uri.as_str()),
                    ("grant_type", "authorization_code"),
                ]),
        )
        .await;
        if !token.ok() {
            return Err(http_response_to_error(
                token.status,
                &token.body,
                "Spotify API /api/token",
            ));
        }
        let access_token = data_str(&token.json(), "access_token")
            .unwrap_or_default()
            .to_string();

        let me = fetch(client.get(ME).bearer_auth(&access_token)).await;
        if !me.ok() {
            return Err(http_response_to_error(
                me.status,
                &me.body,
                "Spotify API /v1/me",
            ));
        }
        Ok(TokenResponse {
            token: access_token,
            username: data_str(&me.json(), "display_name")
                .unwrap_or_default()
                .to_string(),
        })
    }

    async fn is_token_valid(
        &self,
        challenge_response: &str,
        claim_fields: &[ClaimField],
    ) -> VResult<()> {
        let expected = single_account(claim_fields)?;
        let me = fetch(
            browser_like_client()
                .get(ME)
                .bearer_auth(challenge_response),
        )
        .await;
        if !me.ok() {
            return Err(http_response_to_error(
                me.status,
                &me.body,
                "Spotify API /v1/me",
            ));
        }
        let actual = data_str(&me.json(), "display_name")
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
        if self.credentials.client_id.is_none() || self.credentials.client_secret.is_none() {
            return Err(VerifierError::msg(
                "Verifier not configured: Missing Spotify credentials",
            ));
        }
        Ok(())
    }
}
