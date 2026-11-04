---

title: Add a Platform Verifier
sidebar_label: Add a Platform Verifier
sidebar_position: 3
---

# Add a Platform Verifier

A verifier implements one of the two traits in
`services/verifier-bot/src/verifier.rs` and is registered as part of a
`Platform`. Add a module under `services/verifier-bot/src/platforms/` and list
it in `all()` in `platforms/mod.rs`.

Claim data is carried as `ClaimField`s (`{ key: i64, value: String }`); most
platforms use a single field with `key: 0` holding the username/handle.
Verifiers return `VResult<T>` (`Result<T, VerifierError>`); a `VerifierError`
is what the client sees as `{ message, extendedMessage }`.

## Text verifier

Implement `TextPlatform` when ownership can be proven by the user placing their
token in a public bio/description. Implement `get_text` (fetch the bio for a
claim field) and `get_claim_fields_by_url` (derive claim fields from a profile
URL). The `verification_fixtures` / `url_fixtures` drive the health check: a
known profile and the text it contains, and a URL with the fields it parses
to. A unit test fails if a claim type parsed from URLs has no profile fixture.

```rust
use std::sync::LazyLock;

use async_trait::async_trait;
use regex::Regex;

use super::{json_text, profile_fetch_error, require_handle, single_capture};
use crate::claims::ClaimField;
use crate::error::VResult;
use crate::util::{browser_like_client, fetch};
use crate::verifier::{TextPlatform, UrlFixture, VerificationFixture, Verifier};

static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://(?:www\.)?github\.com/([^/]+)/?").unwrap());

struct GithubText;

pub fn verifier() -> Verifier {
    Verifier::text("GitHub", GithubText)
}

#[async_trait]
impl TextPlatform for GithubText {
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        vec![VerificationFixture {
            expected_text: "The Osotnoc Corporation is a multinational business",
            claim_fields: vec![ClaimField::new(0, "osotnoc-corp")],
        }]
    }

    fn url_fixtures(&self) -> Vec<UrlFixture> {
        vec![UrlFixture {
            url: "https://github.com/futo-org",
            expected_claim_fields: vec![ClaimField::new(0, "futo-org")],
        }]
    }

    async fn get_text(&self, field: &ClaimField) -> VResult<String> {
        let handle = require_handle(field)?;
        let profile = fetch(
            browser_like_client().get(format!("https://api.github.com/users/{handle}")),
        )
        .await;
        if !profile.ok() {
            return Err(profile_fetch_error("Unable to find your account", &profile));
        }
        Ok(json_text(&profile.json(), "/bio").trim().to_string())
    }

    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>> {
        single_capture(&URL, url)
    }
}
```

For platforms with anti-bot protection where a plain HTTP request won't return
the bio, load the page through the shared headless Chrome instead
(`SharedBrowser::load`, see `kick.rs` and `rumble.rs`). Prefer a plain request
whenever it works: the headless browser is slower and less reliable.

## OAuth verifier

Implement `OAuthPlatform` when the user proves ownership by signing in.
Implement `oauth_url` (where to send the user: `OAuthUrl::OAuth2` for OAuth 2,
`OAuthUrl::OAuth1` with the request token and secret for OAuth 1.0a),
`get_token` (exchange the callback data for the authenticated username and a
token the client sends back), `is_token_valid` (confirm the token's account
matches the claim) and `health_check` (are the credentials configured?). Read
credentials from `Config` (`HARBOR_VERIFIER_BOT_*`); `configured(...)?` turns a
missing one into "Verifier not configured".

```rust
use async_trait::async_trait;

use super::{configured, single_account};
use crate::claims::ClaimField;
use crate::config::{Config, OAuthCredentials};
use crate::error::{VResult, VerifierError};
use crate::util::{callback_for_platform, encode_uri_component};
use crate::verifier::{OAuthPlatform, OAuthUrl, TokenResponse, Verifier};

struct DiscordOAuth {
    credentials: OAuthCredentials,
    callback_domain: Option<String>,
}

pub fn verifier(config: &Config) -> Verifier {
    Verifier::oauth(
        "Discord",
        DiscordOAuth {
            credentials: config.discord.clone(),
            callback_domain: config.oauth_callback_domain.clone(),
        },
    )
}

#[async_trait]
impl OAuthPlatform for DiscordOAuth {
    async fn oauth_url(&self) -> VResult<OAuthUrl> {
        let client_id = configured(&self.credentials.client_id)?;
        let domain = configured(&self.callback_domain)?;
        let redirect_uri = encode_uri_component(&callback_for_platform(domain, "Discord"));
        Ok(OAuthUrl::OAuth2(format!(
            "https://discord.com/api/oauth2/authorize?client_id={client_id}\
             &redirect_uri={redirect_uri}&response_type=code&scope=identify"
        )))
    }

    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse> {
        // Exchange data["code"] for an access token, look up the account, and
        // return { username, token }.
        todo!()
    }

    async fn is_token_valid(&self, challenge: &str, fields: &[ClaimField]) -> VResult<()> {
        let expected = single_account(fields)?;
        // Decode the token from `challenge`, fetch the account, and compare
        // its username to `expected`.
        todo!()
    }

    async fn health_check(&self) -> VResult<()> {
        if self.credentials.client_id.is_none() || self.credentials.client_secret.is_none() {
            return Err(VerifierError::msg("Verifier not configured: Missing Discord credentials"));
        }
        Ok(())
    }
}
```

See `discord.rs` for a complete `get_token` / `is_token_valid` implementation.
The bot adds a `state` to an OAuth 2 URL that has none and routes the provider's
callback back to the client either way.

## Register the platform

Add the platform to `all()` in `services/verifier-bot/src/platforms/mod.rs`
(and, for a text verifier, a `live_` health check test in the same file).
Routes, `/platforms` listings, and health checks are generated from that list
and each verifier's platform name and type.

Run the offline tests with `cargo test -p verifier-bot`, and the new
platform's live health check with
`cargo test -p verifier-bot -- --ignored live_<platform>`.
