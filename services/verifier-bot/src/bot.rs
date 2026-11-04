//! The bot's Polycentric client: opened on a SQLite file with its private
//! key sealed under `HARBOR_VERIFIER_BOT_KEY_ENCRYPTION_KEY`, given an
//! identity on first run, and a profile so clients can name it.

use std::sync::Arc;

use base64::Engine;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{Content, ProfileUpdate, content::ContentBody};
use polycentric_core::query::event::ListEventsArgs;
use polycentric_core::sdk::keys::AeadKeyCipher;
use polycentric_core::sdk::storage::sqlite::SqliteStorage;
use polycentric_core::sdk::types::SyncStrategy;
use polycentric_core::sdk::{Client, ClientConfig};

use crate::config::Config;

/// Forwards rs-core's log lines to `tracing`.
struct CoreLogger;

impl polycentric_core::logging::Logger for CoreLogger {
    fn log(&self, message: String) {
        tracing::info!(target: "polycentric_core", "{message}");
    }
}

/// Open the bot's client and make sure it has an identity. Reusing the same
/// database keeps a stable identity across restarts: the active login is
/// restored on open.
pub async fn load_client(config: &Config) -> Result<Client, String> {
    polycentric_core::logging::set_logger(Arc::new(CoreLogger));

    let storage = SqliteStorage::open(&config.database_path, None)
        .map_err(|e| format!("failed to open {}: {e}", config.database_path))?;
    let cipher = AeadKeyCipher::new(&config.key_encryption_key).map_err(|e| e.to_string())?;
    let client = Client::open(ClientConfig {
        storage: Arc::new(storage),
        key_cipher: Some(Arc::new(cipher)),
        seed_servers: config.servers.clone(),
        application: None,
        persistent: true,
    })
    .await
    .map_err(|e| format!("failed to open the Polycentric client: {e}"))?;

    // Deployments that kept their state in Postgres (and have no volume for
    // the database file) bring their identity over from there on each boot.
    if let Some(url) = &config.legacy_database_url {
        crate::legacy_postgres::import(&client, url)
            .await
            .map_err(|e| format!("failed to import from the legacy Postgres database: {e}"))?;
    }

    // First run: no identity yet. Creating one also signs in and pushes it.
    if client.active_identity().is_none() {
        tracing::info!("Creating new bot identity");
        client
            .create_identity(None)
            .await
            .map_err(|e| format!("failed to create the bot identity: {e}"))?;
    }

    if let Err(e) = client.sync(SyncStrategy::Partial).await {
        tracing::warn!("Initial sync failed: {e}");
    }

    let key = client
        .active_login()
        .map(|l| base64::engine::general_purpose::STANDARD.encode(l.key_pair.public_key().key))
        .unwrap_or_default();
    tracing::info!(
        "Identity loaded (identityKey: {}, key: {key})",
        client.active_identity().unwrap_or_default()
    );
    Ok(client)
}

/// The profile published for the bot (the name clients show next to its
/// verifications).
pub fn profile_content(config: &Config) -> Content {
    Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: Some(config.profile_name.clone()),
            description: Some(config.profile_description.clone()),
            ..Default::default()
        })),
    }
}

/// Publish the bot's profile unless it has one. Failure is only logged:
/// verifying still works, the bot just shows unnamed.
pub async fn ensure_profile(client: &Client, config: &Config) {
    let Some(identity) = client.active_identity() else {
        return;
    };
    let existing = client
        .list_events(
            ListEventsArgs {
                size: None,
                identity,
                collection: Some(collections::PROFILE),
                signed_by: None,
                sequence_gt: None,
                sequence_lt: None,
                heads: None,
            },
            None,
            None,
        )
        .await;
    let result = match existing {
        Ok(events) if !events.is_empty() => return,
        Ok(_) => client
            .publish_content(&profile_content(config), collections::PROFILE)
            .await
            .map(|_| ()),
        Err(e) => Err(e),
    };
    match result {
        Ok(()) => {
            if let Err(e) = client.sync(SyncStrategy::PartialPush).await {
                tracing::warn!("Failed to push bot profile: {e}");
            }
            tracing::info!("Published bot profile");
        }
        Err(e) => tracing::warn!("Failed to publish bot profile: {e}"),
    }
}
