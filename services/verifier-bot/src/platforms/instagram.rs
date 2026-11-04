use async_trait::async_trait;

use super::{configured, data_str, single_account};
use crate::claims::ClaimField;
use crate::config::{Config, OAuthCredentials};
use crate::error::{VResult, VerifierError};
use crate::util::{
    browser_like_client, callback_for_platform, encode_uri_component, fetch, http_response_to_error,
};
use crate::verifier::{OAuthPlatform, OAuthUrl, TokenResponse, Verifier};

const PLATFORM: &str = "Instagram";
const ME: &str = "https://graph.instagram.com/v17.0/me";

/// The challenge response is the Instagram access token itself.
struct InstagramOAuth {
    credentials: OAuthCredentials,
    callback_domain: Option<String>,
}

pub fn verifier(config: &Config) -> Verifier {
    Verifier::oauth(
        PLATFORM,
        InstagramOAuth {
            credentials: config.instagram.clone(),
            callback_domain: config.oauth_callback_domain.clone(),
        },
    )
}

#[async_trait]
impl OAuthPlatform for InstagramOAuth {
    async fn oauth_url(&self) -> VResult<OAuthUrl> {
        let client_id = configured(&self.credentials.client_id)?;
        let domain = configured(&self.callback_domain)?;
        let redirect_uri = encode_uri_component(&callback_for_platform(domain, PLATFORM));
        Ok(OAuthUrl::OAuth2(format!(
            "https://api.instagram.com/oauth/authorize?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope=user_profile"
        )))
    }

    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse> {
        let client_id = configured(&self.credentials.client_id)?;
        let client_secret = configured(&self.credentials.client_secret)?;
        let domain = configured(&self.callback_domain)?;
        let code = data_str(data, "code").unwrap_or_default();

        let client = browser_like_client();
        let form = reqwest::multipart::Form::new()
            .text("client_id", client_id.to_string())
            .text("client_secret", client_secret.to_string())
            .text("grant_type", "authorization_code")
            .text("redirect_uri", callback_for_platform(domain, PLATFORM))
            .text("code", code.to_string());
        let token = fetch(
            client
                .post("https://api.instagram.com/oauth/access_token")
                .multipart(form),
        )
        .await;
        if !token.ok() {
            return Err(http_response_to_error(
                token.status,
                &token.body,
                "Instagram API /oauth/access_token",
            ));
        }
        let access_token = data_str(&token.json(), "access_token")
            .unwrap_or_default()
            .to_string();

        let me = fetch(
            client
                .get(ME)
                .query(&[("fields", "username"), ("access_token", &access_token)]),
        )
        .await;
        if !me.ok() {
            return Err(http_response_to_error(
                me.status,
                &me.body,
                "Instagram API /me",
            ));
        }
        Ok(TokenResponse {
            username: data_str(&me.json(), "username")
                .unwrap_or_default()
                .to_string(),
            token: access_token,
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
                .query(&[("fields", "username"), ("access_token", challenge_response)]),
        )
        .await;
        if !me.ok() {
            return Err(http_response_to_error(
                me.status,
                &me.body,
                "Instagram API /me",
            ));
        }
        let actual = data_str(&me.json(), "username")
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
                "Verifier not configured: Missing Instagram credentials",
            ));
        }
        Ok(())
    }
}
