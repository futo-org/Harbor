//! Server configuration sourced from the environment.

use std::sync::OnceLock;

pub struct Config {
    /// The canonical URL of this server (`POLYCENTRIC_SERVER_NAME`). Also
    /// stamped as the source on produced Kafka events.
    pub server_name: String,
    /// Accepted auth token audiences (`POLYCENTRIC_ALLOW_HOSTS`, comma
    /// delimited). Defaults to [`Config::server_name`].
    pub allow_hosts: Vec<String>,
    /// Postgres connection URL (`DATABASE_URL`).
    pub database_url: String,
    /// Public URL clients use to fetch blob bodies (`CDN_URL`).
    pub cdn_url: String,
    /// Base URL of the internal scraper service (`POLYCENTRIC_SCRAPER_URL`).
    pub scraper_url: String,
    /// Hex identity string of the trusted moderation service
    /// (`POLYCENTRIC_MODERATION_IDENTITY`). `None` means no content labels.
    pub trusted_moderator: Option<String>,
}

static CONFIG: OnceLock<Config> = OnceLock::new();

/// Read the environment into the process-wide [`Config`]. Called once at
/// startup, after dotenv load.
pub fn init() -> &'static Config {
    CONFIG.get_or_init(|| {
        let server_name = std::env::var("POLYCENTRIC_SERVER_NAME")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        Config {
            allow_hosts: match std::env::var("POLYCENTRIC_ALLOW_HOSTS") {
                Ok(hosts) => hosts
                    .split(',')
                    .map(str::trim)
                    .filter(|host| !host.is_empty())
                    .map(str::to_string)
                    .collect(),
                Err(_) => vec![server_name.clone()],
            },
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://postgres:testing@localhost:5432".to_string()
            }),
            cdn_url: std::env::var("CDN_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            scraper_url: std::env::var("POLYCENTRIC_SCRAPER_URL")
                .unwrap_or_else(|_| "http://localhost:8855".to_string()),
            trusted_moderator: std::env::var("POLYCENTRIC_MODERATION_IDENTITY")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            server_name,
        }
    })
}

/// The startup-loaded configuration. Unit tests don't run `main`, so
/// under test this initializes on first use instead.
pub fn get() -> &'static Config {
    #[cfg(test)]
    {
        init()
    }
    #[cfg(not(test))]
    {
        CONFIG.get().expect("config::init not called")
    }
}
