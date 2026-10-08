//! grayjay-migrator configuration sourced from the environment.
//!
//! Shared by both binaries: the long-running lookup service (`main.rs`) and the
//! one-shot migration tool (`bin/migrate.rs`). `init()` is called once at
//! startup after the dotenv load; `get()` returns the process-wide config.

use std::sync::OnceLock;

pub struct Config {
    /// Postgres URL for the migrator's OWN database, which holds the
    /// `migrated_identity` mapping table (`DATABASE_URL`).
    pub database_url: String,
    /// Schema owning this service's tables
    /// (`HARBOR_GRAYJAY_MIGRATOR_DATABASE_SCHEMA`).
    pub database_schema: String,
    /// Read-only Postgres URL for the legacy (v1) server being migrated, e.g.
    /// srv1-gj (`HARBOR_GRAYJAY_MIGRATOR_LEGACY_DATABASE_URL`). Only the
    /// migration tool needs this.
    pub legacy_database_url: Option<String>,
    /// Hex 32-byte ed25519 seed used as the single master key that signs every
    /// migrated identity and its events
    /// (`HARBOR_GRAYJAY_MIGRATOR_SIGNING_KEY`). Only the migration tool
    /// needs this.
    pub signing_key: Option<String>,
    /// Harbor gRPC server URLs to push migrated events to
    /// (`HARBOR_GRAYJAY_MIGRATOR_SERVERS`, comma delimited).
    pub servers: Vec<String>,
    /// Address the lookup HTTP service binds
    /// (`HARBOR_GRAYJAY_MIGRATOR_HTTP_ADDR`, default `0.0.0.0:3003`).
    pub http_addr: String,
    /// How many legacy systems the migration tool processes concurrently
    /// (`HARBOR_GRAYJAY_MIGRATOR_CONCURRENCY`, default 32).
    pub concurrency: usize,
    /// YouTube Data API v3 key (`..._YOUTUBE_API_KEY`); enables YouTube enrichment.
    pub youtube_api_key: Option<String>,
    /// Server URLs baked into each identity's `Identity.servers`
    /// (`..._IDENTITY_SERVERS`, comma-separated); distinct from `SERVERS`.
    pub identity_servers: Vec<String>,
    /// Postgres URL for the Harbor moderation service's database, used by the
    /// `seed-moderation` step to pre-seed `processed_content`
    /// (`HARBOR_GRAYJAY_MIGRATOR_MODERATION_DATABASE_URL`).
    pub moderation_database_url: Option<String>,
    /// Schema the moderation service owns
    /// (`HARBOR_GRAYJAY_MIGRATOR_MODERATION_DATABASE_SCHEMA`, default
    /// `moderation`).
    pub moderation_database_schema: String,
}

static CONFIG: OnceLock<Config> = OnceLock::new();

/// Read and validate the environment into the process-wide [`Config`].
pub fn init() -> Result<&'static Config, String> {
    let config = Config {
        database_url: std::env::var("HARBOR_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postgres:testing@localhost:5432".to_string()),
        database_schema: std::env::var("HARBOR_GRAYJAY_MIGRATOR_DATABASE_SCHEMA")
            .unwrap_or_else(|_| "grayjay_migrator".to_string()),
        legacy_database_url: optional("HARBOR_GRAYJAY_MIGRATOR_LEGACY_DATABASE_URL"),
        signing_key: optional("HARBOR_GRAYJAY_MIGRATOR_SIGNING_KEY"),
        servers: optional("HARBOR_GRAYJAY_MIGRATOR_SERVERS")
            .map(|s| {
                s.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default(),
        http_addr: std::env::var("HARBOR_GRAYJAY_MIGRATOR_HTTP_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:3003".to_string()),
        concurrency: optional("HARBOR_GRAYJAY_MIGRATOR_CONCURRENCY")
            .and_then(|s| s.parse::<usize>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(32),
        youtube_api_key: optional("HARBOR_GRAYJAY_MIGRATOR_YOUTUBE_API_KEY"),
        identity_servers: optional("HARBOR_GRAYJAY_MIGRATOR_IDENTITY_SERVERS")
            .map(|s| {
                s.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default(),
        moderation_database_url: optional("HARBOR_GRAYJAY_MIGRATOR_MODERATION_DATABASE_URL"),
        moderation_database_schema: std::env::var(
            "HARBOR_GRAYJAY_MIGRATOR_MODERATION_DATABASE_SCHEMA",
        )
        .unwrap_or_else(|_| "moderation".to_string()),
    };

    CONFIG
        .set(config)
        .map_err(|_| "config already initialized".to_string())?;
    Ok(get())
}

/// The process-wide config. Panics if [`init`] has not been called.
pub fn get() -> &'static Config {
    CONFIG.get().expect("config not initialized")
}

fn optional(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}
