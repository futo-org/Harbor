//! Every platform the bot verifies. Routes, `/platforms` listings and
//! health checks are generated from [`all`].

use std::sync::Arc;

use regex::Regex;

use crate::browser::SharedBrowser;
use crate::claims::ClaimField;
use crate::config::Config;
use crate::error::{VResult, VerifierError};
use crate::verifier::Verifier;

mod discord;
mod github;
mod gitlab;
mod hackernews;
mod instagram;
mod kick;
mod nebula;
mod odysee;
mod patreon;
mod rumble;
mod soundcloud;
mod spotify;
mod spreadshop;
mod substack;
mod twitch;
mod vimeo;
mod website;
mod x;
mod youtube;

pub struct Platform {
    pub name: &'static str,
    pub verifiers: Vec<Arc<Verifier>>,
}

fn platform(name: &'static str, verifier: Verifier) -> Platform {
    debug_assert_eq!(verifier.platform, name);
    Platform {
        name,
        verifiers: vec![Arc::new(verifier)],
    }
}

/// The platforms, in the order `/platforms` lists them.
pub fn all(config: &Config, browser: &Arc<SharedBrowser>) -> Vec<Platform> {
    vec![
        platform("Discord", discord::verifier(config)),
        platform("GitHub", github::verifier()),
        platform("GitLab", gitlab::verifier()),
        platform("Hacker News", hackernews::verifier()),
        platform("Instagram", instagram::verifier(config)),
        platform("Kick", kick::verifier(browser.clone())),
        platform("Nebula", nebula::verifier()),
        platform("Odysee", odysee::verifier()),
        platform("Patreon", patreon::verifier(config)),
        platform("Rumble", rumble::verifier(browser.clone())),
        platform("SoundCloud", soundcloud::verifier()),
        platform("Spotify", spotify::verifier(config)),
        platform("Spreadshop", spreadshop::verifier()),
        platform("Substack", substack::verifier()),
        platform("Twitch", twitch::verifier()),
        platform("Vimeo", vimeo::verifier()),
        platform("X", x::verifier(config)),
        platform("YouTube", youtube::verifier()),
        platform("Website", website::verifier()),
    ]
}

/// The `key: 0` field captured by `pattern`'s first group, the way most
/// platforms derive claim fields from a profile URL.
fn single_capture(pattern: &Regex, url: &str) -> VResult<Vec<ClaimField>> {
    pattern
        .captures(url)
        .and_then(|c| c.get(1))
        .map(|m| vec![ClaimField::new(0, m.as_str())])
        .ok_or_else(|| VerifierError::msg("Failed to match regex"))
}

/// Only `key: 0` is supported by the single-field platforms.
fn require_handle(field: &ClaimField) -> VResult<&str> {
    if field.key == 0 {
        Ok(&field.value)
    } else {
        Err(VerifierError::invalid_field(field.key))
    }
}

/// The "couldn't load the profile" error most text verifiers share.
fn profile_fetch_error(message: &str, fetched: &crate::util::Fetched) -> VerifierError {
    VerifierError::new(
        message,
        format!(
            "Failed to get Profile page ({}): '{}'.",
            fetched.status, fetched.status_text
        ),
    )
}

/// The trimmed string at `pointer` in `json`, `""` when it's null or absent
/// (a profile with no bio simply doesn't contain the token).
fn json_text(json: &serde_json::Value, pointer: &str) -> String {
    json.pointer(pointer)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// A setting an OAuth operation needs, or "Verifier not configured".
fn configured(value: &Option<String>) -> VResult<&str> {
    value
        .as_deref()
        .ok_or_else(|| VerifierError::msg("Verifier not configured"))
}

/// The one `key: 0` field OAuth verifiers compare the signed-in account
/// with.
fn single_account(fields: &[ClaimField]) -> VResult<&str> {
    match fields {
        [field] if field.key == 0 => Ok(&field.value),
        _ => Err(VerifierError::new(
            "Invalid claim fields.",
            format!("Invalid claim fields {}", crate::verifier::json(&fields)),
        )),
    }
}

/// Why a challenge response couldn't be decoded.
enum ChallengeError {
    /// Malformed `%` escapes.
    Uri,
    /// Not base64 JSON.
    Json(serde_json::Error),
}

/// Decode a challenge response: URI-encoded base64 of a JSON object (see
/// [`crate::util::encode_object`]).
fn decode_challenge(challenge: &str) -> Result<serde_json::Value, ChallengeError> {
    let base64 = crate::util::decode_uri_component(challenge).ok_or(ChallengeError::Uri)?;
    crate::util::decode_object(&base64).map_err(ChallengeError::Json)
}

/// A string field of the callback data, if present and non-empty.
fn data_str<'a>(data: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    data.get(key)
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::verifier::VerifierKind;

    fn platforms() -> Vec<Platform> {
        let config = Config::for_tests();
        all(
            &config,
            &SharedBrowser::new(config.chrome_executable_path.clone()),
        )
    }

    #[test]
    fn slugs_are_unique() {
        let platforms = platforms();
        let slugs: HashSet<_> = platforms
            .iter()
            .map(|p| crate::util::slug(p.name))
            .collect();
        assert_eq!(slugs.len(), platforms.len());
    }

    #[test]
    fn every_text_verifier_has_a_health_check() {
        let covered = platforms()
            .iter()
            .filter(|p| {
                p.verifiers
                    .iter()
                    .any(|v| matches!(v.kind, VerifierKind::Text(_)))
            })
            .count();
        assert!(covered > 0, "expected at least one text verifier");
    }

    /// `health_check` only fetches the profiles in `verification_fixtures`,
    /// so a claim type missing from them is never exercised against the live
    /// site.
    #[test]
    fn every_claim_type_a_text_verifier_accepts_is_health_checked() {
        for platform in platforms() {
            for verifier in &platform.verifiers {
                let VerifierKind::Text(text) = &verifier.kind else {
                    continue;
                };
                let parsed: HashSet<i64> = text
                    .url_fixtures()
                    .iter()
                    .flat_map(|f| f.expected_claim_fields.iter().map(|c| c.key))
                    .collect();
                assert!(
                    !parsed.is_empty(),
                    "{} has no claim field fixtures",
                    platform.name
                );
                let checked: HashSet<i64> = text
                    .verification_fixtures()
                    .iter()
                    .flat_map(|f| f.claim_fields.iter().map(|c| c.key))
                    .collect();
                let mut missing: Vec<_> = parsed.difference(&checked).collect();
                missing.sort();
                assert!(
                    missing.is_empty(),
                    "{} parses claim type(s) {missing:?} out of URLs but never fetches a profile \
                     for them. Add a verification fixture.",
                    platform.name
                );
            }
        }
    }

    /// One health check per text verifier against the live platform, derived
    /// from [`all`] so the list can't drift. Kick and Rumble need Chrome.
    /// `local_` tests can't run in CI: Rumble and Spreadshop block CI runner
    /// IPs. (OAuth health checks only check configuration.)
    async fn live_health_check(name: &str) {
        let platform = platforms()
            .into_iter()
            .find(|p| p.name == name)
            .expect("platform exists");
        for verifier in &platform.verifiers {
            verifier.init().await;
            if let Err(e) = verifier.health_check().await {
                panic!(
                    "{name}: {} — {}",
                    e.message,
                    e.extended_message.unwrap_or_default()
                );
            }
        }
    }

    macro_rules! live_tests {
        ($($test:ident => $name:literal),* $(,)?) => {$(
            #[tokio::test]
            #[ignore = "reaches a live third-party platform"]
            async fn $test() {
                live_health_check($name).await;
            }
        )*};
    }

    live_tests! {
        live_github_text_health_check => "GitHub",
        live_gitlab_text_health_check => "GitLab",
        live_hacker_news_text_health_check => "Hacker News",
        live_kick_text_health_check => "Kick",
        live_nebula_text_health_check => "Nebula",
        live_odysee_text_health_check => "Odysee",
        live_soundcloud_text_health_check => "SoundCloud",
        live_substack_text_health_check => "Substack",
        live_twitch_text_health_check => "Twitch",
        live_vimeo_text_health_check => "Vimeo",
        live_youtube_text_health_check => "YouTube",
        live_website_text_health_check => "Website",
        local_rumble_text_health_check => "Rumble",
        local_spreadshop_text_health_check => "Spreadshop",
    }

    #[test]
    fn every_text_platform_has_a_live_test() {
        // Keep the macro list above in sync with `all`.
        let tested = [
            "GitHub",
            "GitLab",
            "Hacker News",
            "Kick",
            "Nebula",
            "Odysee",
            "SoundCloud",
            "Substack",
            "Twitch",
            "Vimeo",
            "YouTube",
            "Website",
            "Rumble",
            "Spreadshop",
        ];
        for platform in platforms() {
            let text = platform
                .verifiers
                .iter()
                .any(|v| matches!(v.kind, VerifierKind::Text(_)));
            assert_eq!(
                text,
                tested.contains(&platform.name),
                "{}: add or remove its live health check test",
                platform.name
            );
        }
    }
}
