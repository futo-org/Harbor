//! Moderation service configuration sourced from the environment.

use std::env;
use std::sync::OnceLock;

/// API version for the GA Azure text/image endpoints.
const DEFAULT_AZURE_API_VERSION: &str = "2024-09-01";
/// The multimodal (`imageWithText`) Azure endpoint is preview-only.
const DEFAULT_AZURE_MULTIMODAL_API_VERSION: &str = "2024-09-15-preview";
/// Default PhotoDNA endpoint, also used by the manual PhotoDNA test.
pub(crate) const DEFAULT_PHOTODNA_ENDPOINT: &str =
    "https://api.microsoftmoderator.com/photodna/v1.0";

/// Azure AI Content Safety credentials and API versions.
pub struct AzureConfig {
    /// Resource endpoint (`HARBOR_AZURE_CONTENT_SAFETY_ENDPOINT`).
    pub endpoint: String,
    /// API key (`HARBOR_AZURE_CONTENT_SAFETY_KEY`).
    pub key: String,
    /// api-version for the text/image endpoints
    /// (`HARBOR_AZURE_CONTENT_SAFETY_API_VERSION`).
    pub api_version: String,
    /// api-version for the multimodal endpoint
    /// (`HARBOR_AZURE_CONTENT_SAFETY_MULTIMODAL_API_VERSION`).
    pub multimodal_api_version: String,
}

pub struct Config {
    /// Postgres connection URL (`HARBOR_DATABASE_URL`).
    pub database_url: String,
    /// Postgres read-only connection URL (`HARBOR_DATABASE_URL_RO`).
    pub ro_database_url: Option<String>,
    /// Schema owning this service's tables
    /// (`HARBOR_MODERATION_DATABASE_SCHEMA`).
    pub database_schema: String,
    /// Maximum size of the Postgres connection pool
    /// (`HARBOR_DATABASE_MAX_CONNECTIONS`).
    pub database_max_connections: u32,
    /// Hex 32-byte ed25519 seed labels events are signed with
    /// (`HARBOR_MODERATION_SIGNING_KEY`).
    pub signing_key: String,
    /// Hex identity string this service publishes under
    /// (`HARBOR_MODERATION_IDENTITY`).
    pub identity: String,
    /// gRPC server URLs to bootstrap from and publish to
    /// (`HARBOR_MODERATION_SERVERS`, comma delimited).
    pub servers: Vec<String>,
    /// Azure Content Safety configuration. `None` disables automated
    /// content scoring.
    pub azure: Option<AzureConfig>,
    /// PhotoDNA subscription key (`HARBOR_PHOTODNA_KEY`). `None`
    /// disables PhotoDNA and the service moderates with Azure alone.
    pub photodna_key: Option<String>,
    /// PhotoDNA endpoint (`HARBOR_PHOTODNA_ENDPOINT`).
    pub photodna_endpoint: String,
}

static CONFIG: OnceLock<Config> = OnceLock::new();

/// Read and validate the environment into the process-wide [`Config`].
/// Called once at startup, after dotenv load.
pub fn init() -> Result<&'static Config, String> {
    let identity = required(
        "HARBOR_MODERATION_IDENTITY",
        "POLYCENTRIC_MODERATION_IDENTITY",
    )?
    .trim()
    .to_string();
    if identity.is_empty() {
        return Err("HARBOR_MODERATION_IDENTITY is empty".to_string());
    }

    let config = Config {
        database_url: env::var("HARBOR_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://postgres:testing@localhost:5432".to_string()),
        ro_database_url: env::var("HARBOR_DATABASE_URL_RO")
            .or_else(|_| env::var("DATABASE_URL_RO"))
            .ok(),
        database_schema: env::var("HARBOR_MODERATION_DATABASE_SCHEMA")
            .or_else(|_| env::var("POLYCENTRIC_MODERATION_DATABASE_SCHEMA"))
            .unwrap_or_else(|_| "moderation".to_string()),
        database_max_connections: env::var("HARBOR_DATABASE_MAX_CONNECTIONS")
            .or_else(|_| env::var("POLYCENTRIC_DATABASE_MAX_CONNECTIONS"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(20),
        signing_key: required(
            "HARBOR_MODERATION_SIGNING_KEY",
            "POLYCENTRIC_MODERATION_SIGNING_KEY",
        )?
        .trim()
        .to_string(),
        identity,
        servers: required_list(
            "HARBOR_MODERATION_SERVERS",
            "POLYCENTRIC_MODERATION_SERVERS",
        )?,
        azure: azure_config()?,
        photodna_key: optional("HARBOR_PHOTODNA_KEY", "POLYCENTRIC_PHOTODNA_KEY"),
        photodna_endpoint: env::var("HARBOR_PHOTODNA_ENDPOINT")
            .or_else(|_| env::var("POLYCENTRIC_PHOTODNA_ENDPOINT"))
            .unwrap_or_else(|_| DEFAULT_PHOTODNA_ENDPOINT.to_string()),
    };
    Ok(CONFIG.get_or_init(|| config))
}

/// The startup-validated configuration.
pub fn get() -> &'static Config {
    CONFIG.get().expect("config::init not called")
}

fn azure_config() -> Result<Option<AzureConfig>, String> {
    match (
        optional(
            "HARBOR_AZURE_CONTENT_SAFETY_ENDPOINT",
            "POLYCENTRIC_AZURE_CONTENT_SAFETY_ENDPOINT",
        ),
        optional(
            "HARBOR_AZURE_CONTENT_SAFETY_KEY",
            "POLYCENTRIC_AZURE_CONTENT_SAFETY_KEY",
        ),
    ) {
        (Some(endpoint), Some(key)) => Ok(Some(AzureConfig {
            endpoint,
            key,
            api_version: env::var("HARBOR_AZURE_CONTENT_SAFETY_API_VERSION")
                .or_else(|_| env::var("POLYCENTRIC_AZURE_CONTENT_SAFETY_API_VERSION"))
                .unwrap_or_else(|_| DEFAULT_AZURE_API_VERSION.to_string()),
            multimodal_api_version: env::var("HARBOR_AZURE_CONTENT_SAFETY_MULTIMODAL_API_VERSION")
                .or_else(|_| env::var("POLYCENTRIC_AZURE_CONTENT_SAFETY_MULTIMODAL_API_VERSION"))
                .unwrap_or_else(|_| DEFAULT_AZURE_MULTIMODAL_API_VERSION.to_string()),
        })),
        (None, None) => Ok(None),
        _ => Err("HARBOR_AZURE_CONTENT_SAFETY_ENDPOINT and \
                  HARBOR_AZURE_CONTENT_SAFETY_KEY must be set together"
            .to_string()),
    }
}

fn required(name: &str, fallback_name: &str) -> Result<String, String> {
    env::var(name)
        .or_else(|_| env::var(fallback_name))
        .map_err(|_| format!("{name} is not set"))
}

fn optional(name: &str, fallback_name: &str) -> Option<String> {
    env::var(name)
        .or_else(|_| env::var(fallback_name))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// A required comma-delimited list; must contain at least one entry.
fn required_list(name: &str, fallback_name: &str) -> Result<Vec<String>, String> {
    let items: Vec<String> = required(name, fallback_name)?
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if items.is_empty() {
        return Err(format!("{name} is empty"));
    }
    Ok(items)
}
