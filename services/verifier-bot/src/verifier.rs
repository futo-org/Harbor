//! The two kinds of verifier and the verify flow they share.
//!
//! * **Text** verifiers read a public profile (bio, description, …) and look
//!   for the claimant's loop-back token in it.
//! * **OAuth** verifiers have the user sign in to the platform and compare
//!   the signed-in account with the claim.

use std::time::Instant;

use async_trait::async_trait;
use serde::Serialize;

use crate::claims::{
    ClaimBackend, ClaimField, DecodedClaim, SCHEMA_NAME, fetch_claim, parse_claim_id,
    publish_verify,
};
use crate::error::{VResult, VerifierError};
use crate::metrics::{VERIFICATION_DURATION, VERIFICATIONS, VerificationOutcome};
use crate::util::slug;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerifierType {
    OAuth,
    Text,
}

impl VerifierType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OAuth => "oauth",
            Self::Text => "text",
        }
    }
}

/// A known profile `health_check` fetches, and text it must contain.
#[derive(Clone, Debug)]
pub struct VerificationFixture {
    pub claim_fields: Vec<ClaimField>,
    pub expected_text: &'static str,
}

/// A profile URL `health_check` parses, and the fields it must yield.
#[derive(Clone, Debug)]
pub struct UrlFixture {
    pub url: &'static str,
    pub expected_claim_fields: Vec<ClaimField>,
}

#[async_trait]
pub trait TextPlatform: Send + Sync {
    /// Profiles fetched by the health check. Every claim type the platform
    /// parses out of URLs should be covered.
    fn verification_fixtures(&self) -> Vec<VerificationFixture> {
        Vec::new()
    }

    /// URLs parsed by the health check.
    fn url_fixtures(&self) -> Vec<UrlFixture> {
        Vec::new()
    }

    /// Prepare anything slow (e.g. a headless browser) before serving.
    async fn init(&self) {}

    /// The profile text a claim field points at.
    async fn get_text(&self, field: &ClaimField) -> VResult<String>;

    /// The claim fields a profile URL stands for.
    async fn get_claim_fields_by_url(&self, url: &str) -> VResult<Vec<ClaimField>>;

    /// Fetch the fixture profiles and parse the fixture URLs.
    async fn health_check(&self) -> VResult<()> {
        for fixture in self.verification_fixtures() {
            for field in &fixture.claim_fields {
                let text = self.get_text(field).await?;
                if !text.contains(fixture.expected_text) {
                    return Err(VerifierError::new(
                        "Unexpected description",
                        format!(
                            "Expected description '{}' but found '{text}'",
                            fixture.expected_text
                        ),
                    ));
                }
            }
        }

        for fixture in self.url_fixtures() {
            for field in self.get_claim_fields_by_url(fixture.url).await? {
                let Some(expected) = fixture
                    .expected_claim_fields
                    .iter()
                    .find(|f| f.key == field.key)
                else {
                    return Err(VerifierError::new(
                        "Claim field matching with key is not found",
                        json(&field),
                    ));
                };
                if expected.value != field.value {
                    return Err(VerifierError::new(
                        "Matching claim field value does not match",
                        format!("{}!=={}", json(&field), json(expected)),
                    ));
                }
            }
        }
        Ok(())
    }
}

/// Where `GET .../url` sends the user.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OAuthUrl {
    /// An OAuth 2 authorization URL; the provider echoes its `state` back.
    OAuth2(String),
    /// An OAuth 1.0a authorization URL and the request token (with its
    /// secret) the callback will carry.
    OAuth1 {
        url: String,
        token: String,
        secret: String,
    },
}

/// The account a sign-in proved, and the token the client sends back as its
/// challenge response.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct TokenResponse {
    pub username: String,
    pub token: String,
}

#[async_trait]
pub trait OAuthPlatform: Send + Sync {
    async fn oauth_url(&self) -> VResult<OAuthUrl>;

    /// Exchange the callback's data (the decoded `oauthData`) for the
    /// signed-in account.
    async fn get_token(&self, data: &serde_json::Value) -> VResult<TokenResponse>;

    /// Does the account behind `challenge_response` match `claim_fields`?
    async fn is_token_valid(
        &self,
        challenge_response: &str,
        claim_fields: &[ClaimField],
    ) -> VResult<()>;

    /// Are the credentials configured?
    async fn health_check(&self) -> VResult<()>;
}

pub enum VerifierKind {
    Text(Box<dyn TextPlatform>),
    OAuth(Box<dyn OAuthPlatform>),
}

/// One verifier of one platform (e.g. GitHub's text verifier).
pub struct Verifier {
    /// The platform this verifier handles (e.g. 'X', 'YouTube'). Used only
    /// for routing/identification: every platform shares one claim schema.
    pub platform: String,
    pub kind: VerifierKind,
}

/// The parts of a verify request the verifier needs.
pub struct VerifyRequest<'a> {
    pub content_type: Option<&'a str>,
    pub body: &'a [u8],
    /// `challengeResponse` from the query string (OAuth verifiers).
    pub challenge_response: Option<String>,
}

pub fn json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

impl Verifier {
    pub fn text(platform: &str, imp: impl TextPlatform + 'static) -> Self {
        Self {
            platform: platform.into(),
            kind: VerifierKind::Text(Box::new(imp)),
        }
    }

    pub fn oauth(platform: &str, imp: impl OAuthPlatform + 'static) -> Self {
        Self {
            platform: platform.into(),
            kind: VerifierKind::OAuth(Box::new(imp)),
        }
    }

    pub fn verifier_type(&self) -> VerifierType {
        match self.kind {
            VerifierKind::Text(_) => VerifierType::Text,
            VerifierKind::OAuth(_) => VerifierType::OAuth,
        }
    }

    pub fn slug(&self) -> String {
        slug(&self.platform)
    }

    pub async fn init(&self) {
        if let VerifierKind::Text(text) = &self.kind {
            text.init().await;
        }
    }

    pub async fn health_check(&self) -> VResult<()> {
        match &self.kind {
            VerifierKind::Text(text) => text.health_check().await,
            VerifierKind::OAuth(oauth) => oauth.health_check().await,
        }
    }

    /// Check the profiles the fields point at contain the loop-back token.
    /// Used to verify published claims and as the client pre-check.
    pub async fn check_fields(
        text: &dyn TextPlatform,
        claim_fields: &[ClaimField],
        expected_token: &str,
    ) -> VResult<()> {
        for field in claim_fields {
            let description = text.get_text(field).await?;
            if !description.contains(expected_token) {
                return Err(VerifierError::new(
                    "Unable to find token in your profile description",
                    format!(
                        "Expected token '{expected_token}' was not found in description '{description}' for claimField '{}'.",
                        json(field)
                    ),
                ));
            }
        }
        Ok(())
    }

    async fn should_verify(&self, claim: &DecodedClaim, challenge: Option<String>) -> VResult<()> {
        match &self.kind {
            VerifierKind::Text(text) => {
                tracing::info!("Expected token: '{}'.", claim.expected_token);
                Self::check_fields(text.as_ref(), &claim.fields, &claim.expected_token).await
            }
            VerifierKind::OAuth(oauth) => {
                let Some(challenge) = challenge else {
                    return Err(VerifierError::msg("Missing challengeResponse"));
                };
                oauth.is_token_valid(&challenge, &claim.fields).await
            }
        }
    }

    /// Verify the claim the request references (a hex `EventKey` id) and, if
    /// it checks out, publish a VerificationVerify as the bot's identity.
    /// Returns the hex `EventKey` id of the verify event.
    pub async fn request_verify(
        &self,
        backend: &dyn ClaimBackend,
        request: VerifyRequest<'_>,
    ) -> VResult<String> {
        let platform = self.slug();
        let verifier = self.verifier_type().as_str();
        let started = Instant::now();
        let done = |outcome: VerificationOutcome, result: VResult<String>| {
            VERIFICATION_DURATION
                .with_label_values(&[platform.as_str(), verifier])
                .observe(started.elapsed().as_secs_f64());
            VERIFICATIONS
                .with_label_values(&[platform.as_str(), verifier, outcome.as_str()])
                .inc();
            result
        };

        let claim_id = match request.content_type {
            Some("application/json") => serde_json::from_slice::<serde_json::Value>(request.body)
                .ok()
                .and_then(|body| body.get("claimId")?.as_str().map(String::from)),
            Some("application/octet-stream") => Some(hex::encode(request.body)),
            other => {
                return done(
                    VerificationOutcome::BadRequest,
                    Err(VerifierError::msg(format!(
                        "Unsupported content type '{}'.",
                        other.unwrap_or("undefined")
                    ))),
                );
            }
        };
        let Some(event_key) = claim_id.as_deref().and_then(parse_claim_id) else {
            return done(
                VerificationOutcome::BadRequest,
                Err(VerifierError::msg("Missing or invalid claim id.")),
            );
        };

        let claim = match fetch_claim(backend, &event_key).await {
            Ok(claim) => claim,
            Err(e) => return done(VerificationOutcome::ClaimFetchFailed, Err(e)),
        };

        if claim.schema_name != SCHEMA_NAME {
            return done(
                VerificationOutcome::SchemaMismatch,
                Err(VerifierError::msg(format!(
                    "Claim schema '{}' is not a '{SCHEMA_NAME}' claim.",
                    claim.schema_name
                ))),
            );
        }

        // The claim's platform must match the verifier handling it.
        if let Some(claim_platform) = claim.platform.as_deref().filter(|p| !p.is_empty())
            && claim_platform != platform
        {
            return done(
                VerificationOutcome::PlatformMismatch,
                Err(VerifierError::msg(format!(
                    "Claim is for platform '{claim_platform}', not '{platform}'."
                ))),
            );
        }

        if let Err(e) = self.should_verify(&claim, request.challenge_response).await {
            return done(VerificationOutcome::Rejected, Err(e));
        }

        let verify_id = match publish_verify(backend, &claim.event_key).await {
            Ok(id) => id,
            Err(e) => {
                return done(
                    VerificationOutcome::PublishFailed,
                    Err(VerifierError::msg(format!(
                        "Failed to publish verification: {e}"
                    ))),
                );
            }
        };

        // Delivery to servers is best-effort: the verify is already stored
        // locally and goes out with the next push if this one fails.
        if let Err(e) = backend.push().await {
            tracing::warn!("Failed to push verification to servers: {e}");
        }

        tracing::info!("requestVerify(200): Verified claim. {verify_id}");
        done(VerificationOutcome::Ok, Ok(verify_id))
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;

    /// A text verifier whose profile text is fixed: drives the verify flow
    /// and input validation without touching a live platform.
    pub struct FixedText(pub String);

    #[async_trait]
    impl TextPlatform for FixedText {
        async fn get_text(&self, _field: &ClaimField) -> VResult<String> {
            Ok(self.0.clone())
        }

        async fn get_claim_fields_by_url(&self, _url: &str) -> VResult<Vec<ClaimField>> {
            Err(VerifierError::msg("Not implemented"))
        }
    }

    pub fn dummy(platform: &str, text: &str) -> Verifier {
        Verifier::text(platform, FixedText(text.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use crate::claims::testing::{FakeBackend, IDENTITY};

    fn json_request(body: &str) -> VerifyRequest<'_> {
        VerifyRequest {
            content_type: Some("application/json"),
            body: body.as_bytes(),
            challenge_response: None,
        }
    }

    #[tokio::test]
    async fn text_pre_check_passes_when_the_profile_contains_the_token() {
        let text = FixedText("my bio with token-abc inside".into());
        let fields = [ClaimField::new(0, "someuser")];
        assert!(
            Verifier::check_fields(&text, &fields, "token-abc")
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn text_pre_check_fails_when_the_token_is_missing() {
        let text = FixedText("my bio with token-abc inside".into());
        let fields = [ClaimField::new(0, "someuser")];
        let err = Verifier::check_fields(&text, &fields, "other-token")
            .await
            .unwrap_err();
        assert_eq!(
            err.message,
            "Unable to find token in your profile description"
        );
        assert!(
            err.extended_message
                .unwrap()
                .contains(r#"for claimField '{"key":0,"value":"someuser"}'"#)
        );
    }

    #[tokio::test]
    async fn rejects_an_unsupported_content_type() {
        let verifier = dummy("X", "token");
        let err = verifier
            .request_verify(
                &FakeBackend::default(),
                VerifyRequest {
                    content_type: Some("text/plain"),
                    body: b"{}",
                    challenge_response: None,
                },
            )
            .await
            .unwrap_err();
        assert_eq!(err.message, "Unsupported content type 'text/plain'.");
    }

    #[tokio::test]
    async fn rejects_a_missing_or_invalid_claim_id() {
        let verifier = dummy("X", "token");
        let backend = FakeBackend::default();
        for body in [
            r#"{"claimId":"nonsense"}"#,
            "{}",
            r#"{"claimId":12}"#,
            "not json",
        ] {
            let err = verifier
                .request_verify(&backend, json_request(body))
                .await
                .unwrap_err();
            assert_eq!(err.message, "Missing or invalid claim id.", "{body}");
        }
    }

    #[tokio::test]
    async fn verifies_a_claim_whose_profile_has_the_token() {
        let backend = FakeBackend::default();
        // `platform` and `url` are display metadata; only `account` is proofed.
        let claim_id = backend.add_claim(
            5,
            SCHEMA_NAME,
            &[
                ("platform", "hacker-news"),
                ("account", "test"),
                ("url", "https://news.ycombinator.com/user?id=test"),
            ],
        );
        let verifier = dummy("Hacker News", &format!("about me: {IDENTITY}"));
        let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
        let verify_id = verifier
            .request_verify(&backend, json_request(&body))
            .await
            .unwrap();
        assert!(parse_claim_id(&verify_id).is_some());
        assert_eq!(backend.published.lock().unwrap().len(), 1);
        assert_eq!(*backend.pushes.lock().unwrap(), 1);
    }

    #[tokio::test]
    async fn accepts_the_raw_event_key_as_octet_stream() {
        let backend = FakeBackend::default();
        let claim_id = backend.add_claim(6, SCHEMA_NAME, &[("account", "test")]);
        let verifier = dummy("GitHub", IDENTITY);
        let body = hex::decode(&claim_id).unwrap();
        let result = verifier
            .request_verify(
                &backend,
                VerifyRequest {
                    content_type: Some("application/octet-stream"),
                    body: &body,
                    challenge_response: None,
                },
            )
            .await;
        assert!(result.is_ok(), "{result:?}");
    }

    #[tokio::test]
    async fn fails_on_wrong_schema() {
        let backend = FakeBackend::default();
        let claim_id = backend.add_claim(7, "Freeform", &[("name", "test")]);
        let verifier = dummy("Hacker News", IDENTITY);
        let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
        let err = verifier
            .request_verify(&backend, json_request(&body))
            .await
            .unwrap_err();
        assert_eq!(
            err.message,
            "Claim schema 'Freeform' is not a 'Platform' claim."
        );
        assert!(backend.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn fails_on_platform_mismatch() {
        let backend = FakeBackend::default();
        let claim_id = backend.add_claim(
            8,
            SCHEMA_NAME,
            &[("platform", "youtube"), ("account", "test")],
        );
        let verifier = dummy("Hacker News", IDENTITY);
        let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
        let err = verifier
            .request_verify(&backend, json_request(&body))
            .await
            .unwrap_err();
        assert_eq!(
            err.message,
            "Claim is for platform 'youtube', not 'hacker-news'."
        );
    }

    #[tokio::test]
    async fn rejects_a_profile_without_the_token() {
        let backend = FakeBackend::default();
        let claim_id = backend.add_claim(9, SCHEMA_NAME, &[("account", "test")]);
        let verifier = dummy("GitHub", "no token here");
        let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
        let err = verifier
            .request_verify(&backend, json_request(&body))
            .await
            .unwrap_err();
        assert_eq!(
            err.message,
            "Unable to find token in your profile description"
        );
        assert!(backend.published.lock().unwrap().is_empty());
    }
}
