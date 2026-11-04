//! Configuration from `HARBOR_VERIFIER_BOT_*` environment variables.

use std::env;
use std::time::Duration;

const DEFAULT_SERVERS: &str = "https://east.polycentric.dev";
const DEFAULT_DATABASE_PATH: &str = "./state/polycentric.db";
const DEFAULT_ALLOWED_ORIGINS: &str = "http://localhost:3002,http://localhost:8081,https://harbor.social,https://staging.harbor.social";
const DEFAULT_ALLOWED_CALLBACKS: &str = "harbor://,harbor.staging://,harbor.dev://,exp://,exps://,http://localhost:8081,https://harbor.social,https://staging.harbor.social";
pub const DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS: u64 = 900;

/// An OAuth application's id and secret. Either may be unset (empty counts
/// as unset); each verifier reports "not configured" for the operations
/// that need a missing one.
#[derive(Clone, Debug, Default)]
pub struct OAuthCredentials {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Config {
    /// Port the HTTP API listens on (`PORT`, default 3002).
    pub port: u16,
    /// Servers the bot syncs with (`HARBOR_VERIFIER_BOT_SERVERS`).
    pub servers: Vec<String>,
    /// SQLite file holding the bot's identity and events
    /// (`HARBOR_VERIFIER_BOT_DATABASE_PATH`).
    pub database_path: String,
    /// Seals the bot's private key at rest
    /// (`HARBOR_VERIFIER_BOT_KEY_ENCRYPTION_KEY`, 64 hex characters).
    pub key_encryption_key: [u8; 32],
    /// Postgres the bot used to keep its state in; imported on every start
    /// when set (`HARBOR_VERIFIER_BOT_DATABASE_URL`).
    pub legacy_database_url: Option<String>,
    /// CORS allow-list (`HARBOR_VERIFIER_BOT_ALLOWED_ORIGINS`).
    pub allowed_origins: Vec<String>,
    /// URL prefixes the OAuth callback may redirect to
    /// (`HARBOR_VERIFIER_BOT_ALLOWED_CALLBACKS`).
    pub allowed_callbacks: Vec<String>,
    /// Public base URL of this bot, for OAuth callback URLs
    /// (`HARBOR_VERIFIER_BOT_OAUTH_CALLBACK_DOMAIN`).
    pub oauth_callback_domain: Option<String>,
    /// Chrome/Chromium for the headless-browser verifiers
    /// (`HARBOR_VERIFIER_BOT_CHROME_EXECUTABLE_PATH`, or the older
    /// `HARBOR_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH`). Unset searches the
    /// usual install locations.
    pub chrome_executable_path: Option<String>,
    /// Profile published for the bot's identity on first run.
    pub profile_name: String,
    pub profile_description: String,
    /// How often the health check loop runs; `None` disables it.
    pub health_check_interval: Option<Duration>,
    pub discord: OAuthCredentials,
    pub instagram: OAuthCredentials,
    pub patreon: OAuthCredentials,
    pub spotify: OAuthCredentials,
    /// X's API key / secret.
    pub x: OAuthCredentials,
}

/// A variable's value, empty included.
fn var(name: &str) -> Option<String> {
    env::var(name).ok()
}

/// A variable's value, treating empty as unset.
fn non_empty(name: &str) -> Option<String> {
    var(name).filter(|v| !v.is_empty())
}

fn list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

fn credentials(id: &str, secret: &str) -> OAuthCredentials {
    OAuthCredentials {
        client_id: non_empty(id),
        client_secret: non_empty(secret),
    }
}

/// `HARBOR_VERIFIER_BOT_HEALTH_CHECK_INTERVAL_SECONDS`: unset, empty,
/// negative or not a number fall back to the default; `0` disables the loop.
pub fn health_check_interval(raw: Option<&str>) -> Option<Duration> {
    let seconds = raw
        .filter(|r| !r.trim().is_empty())
        .and_then(|r| r.trim().parse::<f64>().ok())
        .filter(|s| s.is_finite() && *s >= 0.0)
        .unwrap_or(DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS as f64);
    (seconds > 0.0).then(|| Duration::from_secs_f64(seconds))
}

/// Parse the 32-byte key that seals the bot's private key.
pub fn parse_key_encryption_key(raw: Option<&str>) -> Result<[u8; 32], String> {
    const NAME: &str = "HARBOR_VERIFIER_BOT_KEY_ENCRYPTION_KEY";
    let raw = raw
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .ok_or_else(|| {
            format!(
                "{NAME} is not set. It seals the bot's private key at rest and must be 64 hex \
             characters (32 bytes); generate one with `openssl rand -hex 32` and keep it \
             in a secret store. Changing it later makes the stored identity unreadable."
            )
        })?;
    let bytes = hex::decode(raw).map_err(|e| format!("{NAME} is not valid hex: {e}"))?;
    bytes.try_into().map_err(|b: Vec<u8>| {
        format!(
            "{NAME} must be 32 bytes (64 hex characters), got {} bytes",
            b.len()
        )
    })
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let port = match non_empty("PORT") {
            Some(p) => p.parse().map_err(|e| format!("PORT {p:?}: {e}"))?,
            None => 3002,
        };
        Ok(Self {
            port,
            servers: list(
                &non_empty("HARBOR_VERIFIER_BOT_SERVERS").unwrap_or(DEFAULT_SERVERS.into()),
            ),
            database_path: non_empty("HARBOR_VERIFIER_BOT_DATABASE_PATH")
                .unwrap_or(DEFAULT_DATABASE_PATH.into()),
            key_encryption_key: parse_key_encryption_key(
                var("HARBOR_VERIFIER_BOT_KEY_ENCRYPTION_KEY").as_deref(),
            )?,
            legacy_database_url: non_empty("HARBOR_VERIFIER_BOT_DATABASE_URL"),
            allowed_origins: non_empty("HARBOR_VERIFIER_BOT_ALLOWED_ORIGINS")
                .unwrap_or(DEFAULT_ALLOWED_ORIGINS.into())
                .split(',')
                .map(String::from)
                .collect(),
            allowed_callbacks: list(
                &non_empty("HARBOR_VERIFIER_BOT_ALLOWED_CALLBACKS")
                    .unwrap_or(DEFAULT_ALLOWED_CALLBACKS.into()),
            ),
            oauth_callback_domain: non_empty("HARBOR_VERIFIER_BOT_OAUTH_CALLBACK_DOMAIN"),
            chrome_executable_path: non_empty("HARBOR_VERIFIER_BOT_CHROME_EXECUTABLE_PATH")
                .or_else(|| non_empty("HARBOR_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH")),
            profile_name: non_empty("HARBOR_VERIFIER_BOT_PROFILE_NAME")
                .unwrap_or("Verifier".into()),
            profile_description: non_empty("HARBOR_VERIFIER_BOT_PROFILE_DESCRIPTION")
                .unwrap_or("Automated verifier of platform claims.".into()),
            health_check_interval: health_check_interval(
                var("HARBOR_VERIFIER_BOT_HEALTH_CHECK_INTERVAL_SECONDS").as_deref(),
            ),
            discord: credentials(
                "HARBOR_VERIFIER_BOT_DISCORD_CLIENT_ID",
                "HARBOR_VERIFIER_BOT_DISCORD_CLIENT_SECRET",
            ),
            instagram: credentials(
                "HARBOR_VERIFIER_BOT_INSTAGRAM_CLIENT_ID",
                "HARBOR_VERIFIER_BOT_INSTAGRAM_CLIENT_SECRET",
            ),
            patreon: credentials(
                "HARBOR_VERIFIER_BOT_PATREON_CLIENT_ID",
                "HARBOR_VERIFIER_BOT_PATREON_CLIENT_SECRET",
            ),
            spotify: credentials(
                "HARBOR_VERIFIER_BOT_SPOTIFY_CLIENT_ID",
                "HARBOR_VERIFIER_BOT_SPOTIFY_CLIENT_SECRET",
            ),
            x: credentials(
                "HARBOR_VERIFIER_BOT_X_API_KEY",
                "HARBOR_VERIFIER_BOT_X_API_SECRET",
            ),
        })
    }

    /// Configuration for tests: no credentials, no callback domain.
    #[cfg(test)]
    pub fn for_tests() -> Self {
        Self {
            port: 0,
            servers: Vec::new(),
            database_path: String::new(),
            key_encryption_key: [7; 32],
            legacy_database_url: None,
            allowed_origins: list(DEFAULT_ALLOWED_ORIGINS),
            allowed_callbacks: list(DEFAULT_ALLOWED_CALLBACKS),
            oauth_callback_domain: None,
            // Live tests launch the browser named here, like the bot does.
            chrome_executable_path: non_empty("HARBOR_VERIFIER_BOT_CHROME_EXECUTABLE_PATH")
                .or_else(|| non_empty("HARBOR_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH")),
            profile_name: "Verifier".into(),
            profile_description: String::new(),
            health_check_interval: None,
            discord: OAuthCredentials::default(),
            instagram: OAuthCredentials::default(),
            patreon: OAuthCredentials::default(),
            spotify: OAuthCredentials::default(),
            x: OAuthCredentials::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_check_interval_parsing() {
        let default = Some(Duration::from_secs(DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS));
        assert_eq!(health_check_interval(None), default);
        assert_eq!(health_check_interval(Some("")), default);
        assert_eq!(health_check_interval(Some("abc")), default);
        assert_eq!(health_check_interval(Some("-5")), default);
        assert_eq!(health_check_interval(Some("0")), None);
        assert_eq!(
            health_check_interval(Some("60")),
            Some(Duration::from_secs(60))
        );
        assert_eq!(
            health_check_interval(Some("1.5")),
            Some(Duration::from_millis(1500))
        );
    }

    #[test]
    fn key_encryption_key_parsing() {
        assert!(
            parse_key_encryption_key(None)
                .unwrap_err()
                .contains("not set")
        );
        assert!(
            parse_key_encryption_key(Some("zz"))
                .unwrap_err()
                .contains("hex")
        );
        assert!(
            parse_key_encryption_key(Some("abcd"))
                .unwrap_err()
                .contains("32 bytes")
        );
        let key = "11".repeat(32);
        assert_eq!(parse_key_encryption_key(Some(&key)).unwrap(), [0x11; 32]);
    }
}
