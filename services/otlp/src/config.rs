//! OTLP configuration sourced from the environment.

use std::env;
use std::net::SocketAddr;
use std::sync::OnceLock;

pub struct Config {
    /// Address the HTTP listener binds (`HARBOR_OTLP_ADDR`).
    pub addr: SocketAddr,
    /// Accepted auth token audiences (`HARBOR_ALLOW_HOSTS`, comma
    /// delimited): the URLs clients address this service by.
    pub allow_hosts: Vec<String>,
    /// gRPC server URLs to fetch identity documents from
    /// (`HARBOR_QUERY_SERVERS`, comma delimited).
    pub query_servers: Vec<String>,
    /// VictoriaLogs base URL (`HARBOR_VICTORIA_LOGS_URL`). Unset disables
    /// `/v1/logs`.
    pub victoria_logs_url: Option<String>,
    /// VictoriaTraces base URL (`HARBOR_VICTORIA_TRACES_URL`). Unset disables
    /// `/v1/traces`.
    pub victoria_traces_url: Option<String>,
    /// Largest accepted request body in bytes (`HARBOR_OTLP_MAX_BODY_BYTES`).
    pub max_body_bytes: usize,
    /// Where user feedback is relayed to; unset when the bot is not configured.
    pub zulip: Option<Zulip>,
}

/// A Zulip bot posting to one channel topic (`HARBOR_OTLP_ZULIP_*`).
#[derive(Clone)]
pub struct Zulip {
    pub url: String,
    pub bot_email: String,
    pub api_key: String,
    pub stream: String,
    pub topic: String,
}

static CONFIG: OnceLock<Config> = OnceLock::new();

pub fn init() -> Result<&'static Config, String> {
    if let Some(config) = CONFIG.get() {
        return Ok(config);
    }
    let config = Config {
        addr: env::var("HARBOR_OTLP_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:3003".to_string())
            .parse()
            .map_err(|e| format!("HARBOR_OTLP_ADDR: {e}"))?,
        allow_hosts: required_list("HARBOR_ALLOW_HOSTS")?,
        query_servers: required_list("HARBOR_QUERY_SERVERS")?,
        victoria_logs_url: optional_url("HARBOR_VICTORIA_LOGS_URL"),
        victoria_traces_url: optional_url("HARBOR_VICTORIA_TRACES_URL"),
        max_body_bytes: env::var("HARBOR_OTLP_MAX_BODY_BYTES")
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(4 * 1024 * 1024),
        zulip: zulip()?,
    };
    Ok(CONFIG.get_or_init(|| config))
}

/// The bot email and API key enable the relay; the rest has defaults.
fn zulip() -> Result<Option<Zulip>, String> {
    let bot_email = optional("HARBOR_OTLP_ZULIP_BOT_EMAIL");
    let api_key = optional("HARBOR_OTLP_ZULIP_BOT_API_KEY");
    match (bot_email, api_key) {
        (None, None) => Ok(None),
        (Some(bot_email), Some(api_key)) => Ok(Some(Zulip {
            url: optional_url("HARBOR_OTLP_ZULIP_URL")
                .unwrap_or_else(|| "https://zulip.futo.org".to_string()),
            bot_email,
            api_key,
            stream: optional("HARBOR_OTLP_ZULIP_STREAM").unwrap_or_else(|| "harbor".to_string()),
            topic: optional("HARBOR_OTLP_ZULIP_TOPIC").unwrap_or_else(|| "feedback".to_string()),
        })),
        _ => Err(
            "HARBOR_OTLP_ZULIP_BOT_EMAIL and HARBOR_OTLP_ZULIP_BOT_API_KEY go together".to_string(),
        ),
    }
}

fn optional(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn required_list(name: &str) -> Result<Vec<String>, String> {
    parse_list(name, env::var(name).ok().as_deref())
}

fn optional_url(name: &str) -> Option<String> {
    parse_url(env::var(name).ok().as_deref())
}

/// Comma-separated URLs, trimmed and without trailing slashes.
pub fn parse_list(name: &str, raw: Option<&str>) -> Result<Vec<String>, String> {
    let values: Vec<String> = raw
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_end_matches('/').to_string())
        .collect();
    if values.is_empty() {
        return Err(format!("{name} is required"));
    }
    Ok(values)
}

pub fn parse_url(raw: Option<&str>) -> Option<String> {
    raw.map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_are_trimmed_and_unslashed() {
        assert_eq!(
            parse_list("X", Some(" https://a/ ,, http://b ")).unwrap(),
            vec!["https://a", "http://b"]
        );
    }

    #[test]
    fn empty_lists_are_required() {
        assert_eq!(parse_list("X", None).unwrap_err(), "X is required");
        assert_eq!(parse_list("X", Some(" , ")).unwrap_err(), "X is required");
    }

    #[test]
    fn urls_are_optional_and_unslashed() {
        assert_eq!(parse_url(None), None);
        assert_eq!(parse_url(Some("  ")), None);
        assert_eq!(
            parse_url(Some("http://v:9428/")),
            Some("http://v:9428".into())
        );
    }
}
