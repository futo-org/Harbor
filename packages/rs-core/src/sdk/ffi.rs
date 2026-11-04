//! The SDK across the FFI: [`HarborClient`] wraps [`Client`].
//!
//! Everything a host passes or receives is a plain record: the protocol's
//! messages as the generated [`crate::records`], plus the SDK's own records
//! below. Signed and hashed bytes never cross. rs-core encodes new content
//! once, signs, stores and sends it; hosts refer to events by
//! [`EventKey`](records::EventKey) and to content by
//! [`ContentDigest`](records::ContentDigest), and hold a [`PendingEvent`]
//! when an event must stay fixed between two calls.

use std::sync::{Arc, Weak};

use polycentric_common::models::protos_v2 as pb;
use prost::Message;

use crate::lock::LockRecover;
use crate::records;
use crate::sdk::backup::BackupCheck;
use crate::sdk::client::{Client, ClientConfig, Inner};
use crate::sdk::commit::{PreparedEvent, bundle_of};
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::events::ClientEvent as SdkEvent;
use crate::sdk::keys::{KeyCipher, KeyPair};
use crate::sdk::queries::{Kind, QueryData, QueryObservable};
use crate::sdk::storage::sqlite::SqliteStorage;
use crate::sdk::storage::{LoginId as SdkLoginId, LoginStatus, Storage};
use crate::sdk::types::{
    ClientState, HydrationStatus, InitializationStep, LoginKind, PendingLogin, SyncStrategy,
};
use crate::sync::EventPushIssues;

// ── Records ────────────────────────────────────────────────────────────

/// Where the client keeps its data.
#[derive(uniffi::Enum)]
pub enum StorageConfig {
    /// A SQLite file, with blobs as files in `blob_directory` (or in the
    /// database when `None`). Natively, or in Node through its `fs`
    /// (blobs then always live in the database).
    Sqlite {
        path: String,
        blob_directory: Option<String>,
    },
    /// SQLite on the origin private file system. Web only, and only inside
    /// a dedicated worker.
    Opfs { name: String },
    /// Nothing survives the client.
    Memory,
}

#[derive(uniffi::Record)]
pub struct HarborClientConfig {
    pub storage: StorageConfig,
    /// Servers to use until the active identity names its own.
    pub seed_servers: Vec<String>,
    /// Stamped on every event this client creates.
    #[uniffi(default)]
    pub application: Option<records::Application>,
}

/// One of an identity's key pairs, as stored on this device.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct LoginId {
    pub identity: String,
    pub public_key: records::PublicKey,
}

#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct LoginOverview {
    pub id: LoginId,
    pub status: LoginStatus,
}

/// Everything about the client a UI renders. Sent whenever it changes
/// ([`ClientEvent::Snapshot`]).
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct ClientSnapshot {
    pub state: ClientState,
    pub step: InitializationStep,
    pub hydration: HydrationStatus,
    pub error: Option<String>,
    /// False when storage won't survive a restart.
    pub persistent: bool,
    /// The signed-in login.
    pub login: Option<LoginOverview>,
    /// The servers in use: the active identity's, else the seed servers.
    pub servers: Vec<String>,
}

/// The latest known state of an identity, from its identity events.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct IdentityState {
    pub identity_key: String,
    pub rotation_keys: Vec<records::PublicKey>,
    pub signing_keys: Vec<records::PublicKey>,
    pub revocation_bounds: Vec<records::RevocationBound>,
    pub servers: Option<Vec<String>>,
    pub recovery_key: Option<records::PublicKey>,
}

/// A new identity document for the signed-in identity.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct PublishArgs {
    pub rotation_keys: Vec<records::PublicKey>,
    pub signing_keys: Vec<records::PublicKey>,
    #[uniffi(default)]
    pub servers: Option<Vec<String>>,
    #[uniffi(default)]
    pub revocation_bounds: Vec<records::RevocationBound>,
    #[uniffi(default)]
    pub recovery_key: Option<records::PublicKey>,
}

/// A pairing session, as the issuer last published it.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct PairingSession {
    /// Identifies the session; share it with the claiming device
    /// ([`encode_pairing_code`]).
    pub info: records::PairingInfo,
    pub issuer_identity: String,
    pub issuer_signer: Option<records::PublicKey>,
    /// Increases with each state the issuer publishes.
    pub sequence: i64,
    /// The issuer's latest identity event, as it reported it. Verify the
    /// chain (by claiming) before trusting it.
    pub issuer_identity_event: Option<records::EventBundle>,
    /// The servers the issuer's identity names, to claim from.
    pub issuer_servers: Option<Vec<String>>,
    pub claimers: Vec<records::PublicKey>,
    pub expires_at_millis: u64,
}

#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct ServerPushResult {
    pub identity: String,
    pub server: String,
    pub event_issues: Vec<EventPushIssues>,
    pub error: Option<String>,
}

/// What the client reports as it works.
// Boxing would change the FFI type; events are moved, not stored in bulk.
#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, PartialEq, uniffi::Enum)]
pub enum ClientEvent {
    /// State a UI renders changed.
    Snapshot { snapshot: ClientSnapshot },
    /// This client stored a new event of its own.
    Committed { bundle: records::EventBundle },
    /// Events for `identity` arrived from servers.
    Pulled { identity: String },
    /// The outcome of pushing to each server.
    PushResults { results: Vec<ServerPushResult> },
}

/// Receives [`ClientEvent`]s. Called from rs-core; return quickly.
#[uniffi::export(with_foreign)]
pub trait ClientListener: Send + Sync {
    fn on_event(&self, event: ClientEvent);
}

/// A login from an older store, for [`HarborClient::import_legacy_data`].
#[derive(uniffi::Record)]
pub struct LegacyLogin {
    pub identity: String,
    pub key_type: records::KeyType,
    /// The ed25519 seed.
    pub private_key: Vec<u8>,
    pub status: LoginStatus,
}

/// A signed event from an older store, exactly as stored.
#[derive(uniffi::Record)]
pub struct LegacyEvent {
    pub signature: Vec<u8>,
    /// The serialized `Event` the signature covers.
    pub event_bytes: Vec<u8>,
}

// ── Conversions ────────────────────────────────────────────────────────

impl From<SdkLoginId> for LoginId {
    fn from(id: SdkLoginId) -> Self {
        LoginId {
            identity: id.identity,
            public_key: id.public_key.into(),
        }
    }
}

impl From<LoginId> for SdkLoginId {
    fn from(id: LoginId) -> Self {
        SdkLoginId {
            identity: id.identity,
            public_key: id.public_key.into(),
        }
    }
}

impl From<crate::sdk::types::IdentityState> for IdentityState {
    fn from(s: crate::sdk::types::IdentityState) -> Self {
        IdentityState {
            identity_key: s.identity_key,
            rotation_keys: s.rotation_keys.into_iter().map(Into::into).collect(),
            signing_keys: s.signing_keys.into_iter().map(Into::into).collect(),
            revocation_bounds: s.revocation_bounds.into_iter().map(Into::into).collect(),
            servers: s.servers,
            recovery_key: s.recovery_key.map(Into::into),
        }
    }
}

impl From<PublishArgs> for crate::sdk::types::PublishArgs {
    fn from(args: PublishArgs) -> Self {
        crate::sdk::types::PublishArgs {
            rotation_keys: args.rotation_keys.into_iter().map(Into::into).collect(),
            signing_keys: args.signing_keys.into_iter().map(Into::into).collect(),
            servers: args.servers,
            revocation_bounds: args.revocation_bounds.into_iter().map(Into::into).collect(),
            recovery_key: args.recovery_key.map(Into::into),
            recovery_signature: None,
        }
    }
}

impl From<crate::sdk::types::PairingSession> for PairingSession {
    fn from(s: crate::sdk::types::PairingSession) -> Self {
        let issuer_servers = s
            .issuer_state
            .identity_state
            .as_ref()
            .and_then(|b| b.serialized_content.as_ref())
            .and_then(|c| pb::Content::decode(c.content_bytes.as_slice()).ok())
            .and_then(|c| match c.content_body? {
                pb::content::ContentBody::Identity(identity) => identity.servers,
                _ => None,
            })
            .map(|list| list.urls);
        PairingSession {
            info: s.pairing_info.into(),
            issuer_identity: s.digest.issuer_identity.clone(),
            issuer_signer: s.digest.issuer_signer.clone().map(Into::into),
            sequence: s.issuer_state.sequence,
            issuer_identity_event: s.issuer_state.identity_state.map(Into::into),
            issuer_servers,
            claimers: s.claimers.into_iter().map(Into::into).collect(),
            expires_at_millis: s.expires_at_millis,
        }
    }
}

impl From<crate::sdk::types::ServerPushResult> for ServerPushResult {
    fn from(r: crate::sdk::types::ServerPushResult) -> Self {
        ServerPushResult {
            identity: r.identity,
            server: r.server,
            event_issues: r.event_issues,
            error: r.error,
        }
    }
}

fn snapshot_of(client: &Client) -> ClientSnapshot {
    let login = client.active_login().map(|l| LoginOverview {
        id: l.id.into(),
        status: client
            .active_login_status()
            .unwrap_or(LoginStatus::LiveSigningKey),
    });
    ClientSnapshot {
        state: client.state(),
        step: client.step(),
        hydration: client.hydration_status(),
        error: client.error(),
        persistent: client.is_persistent(),
        login,
        servers: client.servers(),
    }
}

/// The host-facing form of an SDK event, or `None` for one hosts don't see.
fn host_event(client: &Client, event: &SdkEvent) -> Option<ClientEvent> {
    Some(match event {
        SdkEvent::StateChanged(_)
        | SdkEvent::Progress(_)
        | SdkEvent::HydrationStatus(_)
        | SdkEvent::Error(_)
        | SdkEvent::LoginChanged(_)
        | SdkEvent::ServersChanged => ClientEvent::Snapshot {
            snapshot: snapshot_of(client),
        },
        SdkEvent::Committed {
            signed_event,
            content,
        } => ClientEvent::Committed {
            bundle: bundle_of(signed_event.clone(), content.clone().unwrap_or_default()).into(),
        },
        SdkEvent::Pulled { identity } => ClientEvent::Pulled {
            identity: identity.clone(),
        },
        SdkEvent::PushResults(results) => ClientEvent::PushResults {
            results: results.iter().cloned().map(Into::into).collect(),
        },
    })
}

fn bundles(bundles: Vec<pb::EventBundle>) -> Vec<records::EventBundle> {
    bundles.into_iter().map(Into::into).collect()
}

// ── Free functions ─────────────────────────────────────────────────────

/// The id an [`EventKey`](records::EventKey) is shared as (in links, and
/// to the verifier): the hex of its serialization.
#[uniffi::export]
pub fn event_key_id(key: records::EventKey) -> String {
    hex::encode(pb::EventKey::from(key).encode_to_vec())
}

/// The [`EventKey`](records::EventKey) an [`event_key_id`] names, or `None`
/// if it isn't one.
#[uniffi::export]
pub fn parse_event_key_id(id: String) -> Option<records::EventKey> {
    let bytes = hex::decode(id.trim()).ok()?;
    let key = pb::EventKey::decode(bytes.as_slice()).ok()?;
    if key.identity.is_empty() || key.signed_by.is_none() {
        return None;
    }
    Some(key.into())
}

/// A pairing session's [`PairingInfo`](records::PairingInfo) as a code for
/// a link or QR code (unpadded URL-safe base64).
#[uniffi::export]
pub fn encode_pairing_code(info: records::PairingInfo) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(pb::PairingInfo::from(info).encode_to_vec())
}

/// The [`PairingInfo`](records::PairingInfo) in a pairing code (base64 in
/// either alphabet, or hex), or `None` if it isn't one.
#[uniffi::export]
pub fn decode_pairing_code(code: String) -> Option<records::PairingInfo> {
    use base64::Engine;
    use base64::engine::general_purpose::{STANDARD, URL_SAFE};
    let code = code.trim();
    let decode = |bytes: Vec<u8>| -> Option<records::PairingInfo> {
        let info = pb::PairingInfo::decode(bytes.as_slice()).ok()?;
        (!info.digest_sha256.is_empty() && !info.server.is_empty()).then(|| info.into())
    };
    let padded = format!("{code}{}", "=".repeat((4 - code.len() % 4) % 4));
    hex::decode(code)
        .ok()
        .and_then(decode)
        .or_else(|| URL_SAFE.decode(&padded).ok().and_then(decode))
        .or_else(|| STANDARD.decode(&padded).ok().and_then(decode))
}

/// `{type}_{hex}`: the string form of a digest, used in blob URLs and
/// file names.
#[uniffi::export]
pub fn digest_key(digest: records::ContentDigest) -> String {
    pb::ContentDigest::from(digest).to_id()
}

/// The blobs (images) `content` references.
#[uniffi::export]
pub fn collect_blobs(content: records::Content) -> Vec<records::Blob> {
    crate::sdk::sync::collect_blobs(&content.into())
        .into_iter()
        .map(Into::into)
        .collect()
}

/// Where each of `servers` serves a blob, in order. Pure: pass the
/// servers from [`ClientSnapshot::servers`].
#[uniffi::export]
pub fn blob_urls(servers: Vec<String>, digest: records::ContentDigest) -> Vec<String> {
    crate::sdk::sync::blob_urls(&servers, &digest.into())
}

/// `image_url` through each of `servers`' image proxy, in order.
#[uniffi::export]
pub fn image_proxy_urls(servers: Vec<String>, image_url: String) -> Vec<String> {
    crate::sdk::sync::image_proxy_urls(&servers, &image_url)
}

/// The identity [`HarborClient::create_identity_from_seed`] creates for
/// `seed` (32 bytes) on `servers`. For tooling with fixed test users.
#[uniffi::export]
pub fn identity_key_for_seed(seed: Vec<u8>, servers: Vec<String>) -> Result<String, SdkError> {
    let key_pair = KeyPair::from_private_key(pb::KeyType::Ed25519 as i32, &seed)?;
    Ok(crate::sdk::logins::identity_key_for(&key_pair, servers))
}

/// The identity and age of a backup, or an error if `text` isn't one.
#[uniffi::export]
pub fn backup_info(text: String) -> Result<crate::sdk::backup::BackupInfo, SdkError> {
    crate::sdk::backup::backup_info(&text)
}

#[uniffi::export]
pub fn is_identity_key(s: String) -> bool {
    polycentric_common::alias::is_identity_key(&s)
}

/// Canonical form of an alias for comparison, or `None` when malformed.
#[uniffi::export]
pub fn normalize_alias(alias: String) -> Option<String> {
    polycentric_common::alias::normalize_alias(&alias)
}

/// The identity an alias (`user@domain.com`) points at, if any.
#[uniffi::export]
pub async fn resolve_alias(alias: String) -> Option<String> {
    crate::sdk::network::resolve_alias(&alias).await
}

/// Decode `image`, resize it into `width` x `height` (`mode` "fill" crops,
/// "fit" letterboxes), and encode it as JPEG.
#[uniffi::export]
pub fn process_image_to_jpeg(
    image: Vec<u8>,
    width: u32,
    height: u32,
    mode: String,
) -> Result<crate::media::process_image::ProcessedImage, SdkError> {
    use crate::media::process_image::{ResizeMode, process_image};
    let mode = match mode.as_str() {
        "fit" => ResizeMode::Fit,
        _ => ResizeMode::Fill,
    };
    process_image(&image, width, height, mode)
        .map_err(|e| SdkError::InvalidInput(format!("process_image failed: {e}")))
}

// ── Builder ────────────────────────────────────────────────────────────

/// Opens a [`HarborClient`]. Host callbacks are set one at a time because
/// foreign objects nested in records don't cross the JS bindings.
#[derive(uniffi::Object)]
pub struct HarborClientBuilder {
    config: std::sync::Mutex<Option<HarborClientConfig>>,
    key_cipher: std::sync::Mutex<Option<Arc<dyn KeyCipher>>>,
}

#[cfg_attr(not(target_arch = "wasm32"), uniffi::export(async_runtime = "tokio"))]
#[cfg_attr(target_arch = "wasm32", uniffi::export)]
impl HarborClientBuilder {
    #[uniffi::constructor]
    pub fn new(config: HarborClientConfig) -> Arc<Self> {
        Arc::new(Self {
            config: std::sync::Mutex::new(Some(config)),
            key_cipher: std::sync::Mutex::new(None),
        })
    }

    /// Seal private keys at rest with `cipher`. Required unless storage is
    /// [`StorageConfig::Memory`].
    pub fn key_cipher(&self, cipher: Arc<dyn KeyCipher>) {
        *self.key_cipher.lock_recover() = Some(cipher);
    }

    /// Open storage, hydrate the protocol engine and restore the stored
    /// login. A builder opens once.
    pub async fn open(&self) -> Result<Arc<HarborClient>, SdkError> {
        let config = self
            .config
            .lock_recover()
            .take()
            .ok_or_else(|| SdkError::InvalidInput("builder already opened".into()))?;
        let key_cipher = self.key_cipher.lock_recover().clone();
        let (storage, persistent): (Arc<dyn Storage>, bool) = match config.storage {
            #[cfg(not(target_arch = "wasm32"))]
            StorageConfig::Sqlite {
                path,
                blob_directory,
            } => (
                Arc::new(SqliteStorage::open(path, blob_directory.map(Into::into))?),
                true,
            ),
            // Under Node, through its `fs`; blobs live in the database.
            #[cfg(target_arch = "wasm32")]
            StorageConfig::Sqlite { path, .. } => {
                (Arc::new(SqliteStorage::open_node(&path)?), true)
            }
            #[cfg(target_arch = "wasm32")]
            StorageConfig::Opfs { name } => {
                (Arc::new(SqliteStorage::open_opfs(&name).await?), true)
            }
            #[cfg(not(target_arch = "wasm32"))]
            StorageConfig::Opfs { .. } => {
                return Err(SdkError::InvalidInput(
                    "OPFS storage is only available on the web".into(),
                ));
            }
            StorageConfig::Memory => (Arc::new(SqliteStorage::open_in_memory()?), false),
        };
        let client = Client::open(ClientConfig {
            storage,
            key_cipher,
            seed_servers: config.seed_servers,
            application: config.application.map(Into::into),
            persistent,
        })
        .await?;
        Ok(Arc::new(HarborClient { client }))
    }
}

// ── Pending events ─────────────────────────────────────────────────────

/// A signed event not yet stored, from [`HarborClient::prepare_event`].
/// Show it (e.g. optimistically), then [`HarborClient::commit_event`] it.
#[derive(uniffi::Object)]
pub struct PendingEvent {
    prepared: PreparedEvent,
}

#[uniffi::export]
impl PendingEvent {
    /// The event and its content.
    pub fn bundle(&self) -> records::EventBundle {
        self.prepared.bundle().into()
    }

    pub fn key(&self) -> records::EventKey {
        pb::Event::decode(self.prepared.signed.event_bytes.as_slice())
            .ok()
            .and_then(|e| e.key)
            .unwrap_or_default()
            .into()
    }
}

// ── Client ─────────────────────────────────────────────────────────────

#[derive(uniffi::Object)]
pub struct HarborClient {
    client: Client,
}

impl HarborClient {
    /// The SDK client, for Rust callers.
    pub fn sdk(&self) -> &Client {
        &self.client
    }
}

/// Builds a [`Client`] handle from a weak reference, so listeners don't keep
/// the client alive.
fn upgrade(weak: &Weak<Inner>) -> Option<Client> {
    Some(Client {
        inner: weak.upgrade()?,
    })
}

#[cfg_attr(not(target_arch = "wasm32"), uniffi::export(async_runtime = "tokio"))]
#[cfg_attr(target_arch = "wasm32", uniffi::export)]
impl HarborClient {
    // ── State ───────────────────────────────────────────────────────

    /// What a UI renders. Kept current by [`ClientEvent::Snapshot`].
    pub fn snapshot(&self) -> ClientSnapshot {
        snapshot_of(&self.client)
    }

    pub fn add_listener(&self, listener: Arc<dyn ClientListener>) -> u64 {
        let weak = Arc::downgrade(&self.client.inner);
        self.client.add_listener(Arc::new(move |e: &SdkEvent| {
            if let Some(client) = upgrade(&weak)
                && let Some(event) = host_event(&client, e)
            {
                listener.on_event(event);
            }
        }))
    }

    pub fn remove_listener(&self, id: u64) {
        self.client.remove_listener(id)
    }

    /// Use `servers` until the active identity's document names its own.
    pub fn set_servers(&self, servers: Vec<String>) {
        self.client.set_servers(servers);
    }

    /// A JWT authenticating the active identity to `audience`.
    pub fn create_server_jwt(&self, audience: String) -> Result<String, SdkError> {
        self.client.mint_server_jwt(&audience)
    }

    // ── Publishing ──────────────────────────────────────────────────

    /// Publish `content` in `collection` as the signed-in login.
    pub async fn publish(
        &self,
        content: records::Content,
        collection: i32,
    ) -> Result<records::EventBundle, SdkError> {
        Ok(self
            .client
            .publish_content(&content.into(), collection)
            .await?
            .into())
    }

    /// Sign `content` in `collection` as the signed-in login without
    /// storing it.
    pub async fn prepare_event(
        &self,
        content: records::Content,
        collection: i32,
    ) -> Result<Arc<PendingEvent>, SdkError> {
        let prepared = self.client.prepare(&content.into(), collection).await?;
        Ok(Arc::new(PendingEvent { prepared }))
    }

    /// Store a prepared event. Fails with `AlreadyExists` if its sequence
    /// was taken since; prepare it again then.
    pub async fn commit_event(
        &self,
        event: Arc<PendingEvent>,
    ) -> Result<records::EventBundle, SdkError> {
        Ok(self.client.commit(&event.prepared).await?.into())
    }

    // ── Local reads ─────────────────────────────────────────────────

    /// The latest known state of `identity` (default: the signed-in one).
    pub fn resolve_identity(&self, identity: Option<String>) -> Option<IdentityState> {
        self.client
            .resolve_identity(identity.as_deref())
            .map(Into::into)
    }

    /// The identity chain of `identity`, oldest first.
    pub fn resolve_identity_chain(
        &self,
        identity: String,
    ) -> Result<Vec<records::EventBundle>, SdkError> {
        Ok(bundles(self.client.resolve_identity_chain(&identity)?))
    }

    /// Identities the signed-in identity blocks.
    pub fn blocked_identities(&self) -> Vec<String> {
        self.client.blocked_identities()
    }

    /// Non-deleted events of one stream, from what's held locally.
    pub fn list_valid_events(
        &self,
        identity: String,
        collection: i32,
    ) -> Result<Vec<records::EventBundle>, SdkError> {
        Ok(bundles(
            self.client.list_valid_events(&identity, collection)?,
        ))
    }

    // ── Queries ─────────────────────────────────────────────────────

    /// Run `query` across the servers (or `opts.servers`). `query_key` is
    /// the cache key shared across subscribers; `None` bypasses the cache.
    pub fn fetch_query(
        &self,
        query_key: Option<crate::query::QueryKey>,
        query: crate::api::Query,
        opts: Option<crate::query::QueryOpts>,
    ) -> Arc<QueryObservable> {
        let kind = Kind::of(&query);
        QueryObservable::new(self.client.core().fetch_query(query_key, query, opts), kind)
    }

    /// The first successful result of `query`, or `None` if it completed
    /// without one.
    pub async fn await_query(
        &self,
        query: crate::api::Query,
        query_key: Option<crate::query::QueryKey>,
        opts: Option<crate::query::QueryOpts>,
    ) -> Result<Option<QueryData>, SdkError> {
        let kind = Kind::of(&query);
        let bytes = self
            .client
            .core()
            .await_query(query, query_key, opts)
            .await?;
        Ok(bytes.and_then(|b| kind.decode(&b)))
    }

    /// One-shot ListEvents; results also land in the protocol engine.
    pub async fn list_events(
        &self,
        args: crate::query::event::ListEventsArgs,
        query_key: Option<crate::query::QueryKey>,
        opts: Option<crate::query::QueryOpts>,
    ) -> Result<Vec<records::EventBundle>, SdkError> {
        Ok(bundles(
            self.client.list_events(args, query_key, opts).await?,
        ))
    }

    /// Clear the cache for `query_key` and every key under it.
    pub fn invalidate_query(&self, query_key: crate::query::QueryKey) {
        self.client.core().invalidate_query(query_key)
    }

    pub fn invalidate_all_queries(&self) {
        self.client.core().invalidate_all_queries()
    }

    // ── Sync ────────────────────────────────────────────────────────

    /// Pull and/or push per `strategy`; returns how many events were pulled.
    pub async fn sync(&self, strategy: SyncStrategy) -> Result<u32, SdkError> {
        self.client.sync(strategy).await
    }

    pub fn start_live_sync(&self) {
        self.client.start_live_sync()
    }

    pub fn stop_live_sync(&self) {
        self.client.stop_live_sync()
    }

    // ── Blobs ───────────────────────────────────────────────────────

    /// Store blob bytes; returns the blob to reference from content. It's
    /// uploaded when the content is pushed.
    pub async fn commit_blob(
        &self,
        bytes: Vec<u8>,
        mime_type: String,
    ) -> Result<records::Blob, SdkError> {
        Ok(self.client.commit_blob(bytes, &mime_type).await?.into())
    }

    /// The blob's bytes from local storage, or `None`.
    pub async fn get_blob(
        &self,
        digest: records::ContentDigest,
    ) -> Result<Option<Vec<u8>>, SdkError> {
        self.client.get_blob(digest.into()).await
    }

    pub async fn has_blob(&self, digest: records::ContentDigest) -> Result<bool, SdkError> {
        self.client.has_blob(digest.into()).await
    }

    pub async fn delete_blob(&self, digest: records::ContentDigest) -> Result<bool, SdkError> {
        self.client.delete_blob(digest.into()).await
    }

    /// The blob's bytes, locally or from the servers.
    pub async fn fetch_blob(&self, digest: records::ContentDigest) -> Option<Vec<u8>> {
        self.client.fetch_blob_bytes(&digest.into()).await
    }

    /// Upload a blob's body to `servers` (default: all).
    pub async fn upload_blob(
        &self,
        blob: records::Blob,
        body: Vec<u8>,
        servers: Option<Vec<String>>,
    ) {
        self.client.upload_blob(&blob.into(), body, servers).await
    }

    // ── Logins ──────────────────────────────────────────────────────

    pub async fn list_logins(
        &self,
        identity: Option<String>,
    ) -> Result<Vec<LoginOverview>, SdkError> {
        Ok(self
            .client
            .list_logins(identity)
            .await?
            .into_iter()
            .map(|l| LoginOverview {
                id: l.id.into(),
                status: l.status,
            })
            .collect())
    }

    /// Sign in as `login`, or out with `None`. With `persist`, it's also
    /// the login restored next time.
    pub async fn login_as(&self, login: Option<LoginId>, persist: bool) -> Result<(), SdkError> {
        self.client.login_as(login.map(Into::into), persist).await
    }

    pub async fn change_login_status(
        &self,
        id: LoginId,
        status: LoginStatus,
    ) -> Result<(), SdkError> {
        self.client.change_login_status(id.into(), status).await
    }

    pub async fn delete_login(&self, id: LoginId) -> Result<(), SdkError> {
        self.client.delete_login(id.into()).await
    }

    /// Create and publish a new identity and sign in as it. `server` is
    /// added to the server list first if given.
    pub async fn create_identity(&self, server: Option<String>) -> Result<LoginId, SdkError> {
        Ok(self.client.create_identity(server).await?.into())
    }

    /// [`HarborClient::create_identity`] with a fixed key (`seed`, 32
    /// bytes), so tooling can recreate the same test users anywhere. Apps
    /// should use `create_identity`, which generates the key in rs-core.
    pub async fn create_identity_from_seed(
        &self,
        seed: Vec<u8>,
        server: Option<String>,
    ) -> Result<LoginId, SdkError> {
        let key_pair = KeyPair::from_private_key(pb::KeyType::Ed25519 as i32, &seed)?;
        Ok(self
            .client
            .create_identity_with(key_pair, server)
            .await?
            .into())
    }

    /// Generate and store a key pair to pair (or recover) into `identity`.
    pub async fn begin_login(
        &self,
        identity: String,
        kind: LoginKind,
    ) -> Result<LoginOverview, SdkError> {
        let pending = self.client.begin_login(&identity, kind).await?;
        Ok(LoginOverview {
            id: pending.id.into(),
            status: pending.status,
        })
    }

    /// Claim an identity that authorized a pending login's key: verify the
    /// chain, store it, publish as the new key and sign in. Queries
    /// `servers` (default: the configured ones).
    pub async fn claim(
        &self,
        login: LoginId,
        servers: Option<Vec<String>>,
    ) -> Result<IdentityState, SdkError> {
        let pending = self.pending_login(login).await?;
        Ok(self.client.claim(pending, servers).await?.into())
    }

    // ── Backups ─────────────────────────────────────────────────────

    /// Rotate the recovery key and return a backup of the signed-in
    /// identity as text. Older backups stop working.
    pub async fn create_backup(&self) -> Result<String, SdkError> {
        self.client.create_backup().await
    }

    /// Whether `backup` can restore `identity` (default: the signed-in one).
    pub fn check_backup(&self, backup: String, identity: Option<String>) -> BackupCheck {
        self.client.check_backup(&backup, identity.as_deref())
    }

    /// Restore the identity `backup` is for and sign in as it.
    pub async fn recover_from_backup(&self, backup: String) -> Result<LoginId, SdkError> {
        Ok(self.client.recover_from_backup(&backup).await?.into())
    }

    // ── Identity ────────────────────────────────────────────────────

    /// Publish a new document for the signed-in identity; the signed-in key
    /// must be a rotation key. Returns the identity event's key.
    pub async fn publish_identity_update(
        &self,
        args: PublishArgs,
    ) -> Result<records::EventKey, SdkError> {
        let update = self.client.publish_identity_update(args.into()).await?;
        event_key_of(&update.signed_event)
    }

    pub async fn add_signing_key(
        &self,
        key: records::PublicKey,
    ) -> Result<records::EventKey, SdkError> {
        event_key_of(&self.client.add_signing_key(key.into()).await?)
    }

    pub async fn remove_signing_key(
        &self,
        key: records::PublicKey,
    ) -> Result<records::EventKey, SdkError> {
        event_key_of(&self.client.remove_signing_key(key.into()).await?)
    }

    pub async fn add_rotation_key(
        &self,
        key: records::PublicKey,
    ) -> Result<records::EventKey, SdkError> {
        event_key_of(&self.client.add_rotation_key(key.into()).await?)
    }

    pub async fn remove_rotation_key(
        &self,
        key: records::PublicKey,
    ) -> Result<records::EventKey, SdkError> {
        event_key_of(&self.client.remove_rotation_key(key.into()).await?)
    }

    pub async fn add_server(&self, url: String) -> Result<records::EventKey, SdkError> {
        event_key_of(&self.client.add_server(url).await?)
    }

    pub async fn remove_server(&self, url: String) -> Result<records::EventKey, SdkError> {
        event_key_of(&self.client.remove_server(url).await?)
    }

    // ── Pairing ─────────────────────────────────────────────────────

    /// Issuer side: start a session for the signed-in identity on `server`.
    pub async fn create_pairing_session(&self, server: String) -> Result<PairingSession, SdkError> {
        Ok(self.client.create_pairing_session(&server).await?.into())
    }

    /// Issuer side: publish a new state (after authorizing a claimer) for a
    /// session this client created.
    pub async fn update_pairing_session(
        &self,
        info: records::PairingInfo,
        sequence: i64,
    ) -> Result<PairingSession, SdkError> {
        Ok(self
            .client
            .update_pairing_session(&info.into(), sequence)
            .await?
            .into())
    }

    pub async fn get_pairing_session(
        &self,
        info: records::PairingInfo,
    ) -> Result<PairingSession, SdkError> {
        Ok(self.client.get_pairing_session(&info.into()).await?.into())
    }

    /// Claimer side: ask to be paired with a pending login's key.
    pub async fn join_pairing_session(
        &self,
        info: records::PairingInfo,
        login: LoginId,
    ) -> Result<(), SdkError> {
        self.client
            .join_pairing_session(&info.into(), &login.public_key.into())
            .await
    }

    /// Issuer side: the keys asking to be paired.
    pub async fn poll_for_claimers(
        &self,
        info: records::PairingInfo,
    ) -> Result<Vec<records::PublicKey>, SdkError> {
        Ok(self
            .client
            .poll_for_claimers(&info.into())
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    /// Claimer side: whether the issuer has authorized a pending login's
    /// key. Then [`HarborClient::claim`].
    pub async fn poll_for_authorization(
        &self,
        info: records::PairingInfo,
        login: LoginId,
    ) -> Result<bool, SdkError> {
        self.client
            .poll_for_authorization(&info.into(), &login.public_key.into())
            .await
    }

    // ── Servers ─────────────────────────────────────────────────────

    /// Link preview for `url` from the first server that answers.
    pub async fn url_info(&self, url: String) -> Option<records::UrlInfoResponse> {
        self.client.url_info(&url).await.map(Into::into)
    }

    pub async fn server_info(
        &self,
        server: String,
    ) -> Result<records::GetServerInfoResponse, SdkError> {
        Ok(self.client.get_server_info(&server).await?.into())
    }

    /// Ban or unban an identity on `server` (moderators only).
    pub async fn set_ban_status(
        &self,
        server: String,
        target_identity: String,
        banned: bool,
    ) -> Result<(), SdkError> {
        self.client
            .set_ban_status(&server, &target_identity, banned)
            .await
    }

    pub async fn resolve_report(
        &self,
        server: String,
        report_id: i64,
        status: records::ReportStatus,
    ) -> Result<(), SdkError> {
        self.client
            .resolve_report(&server, report_id, status.into())
            .await
    }

    /// Remove an event's content from `server` (moderators only).
    pub async fn delete_content(
        &self,
        server: String,
        target: records::EventKey,
    ) -> Result<(), SdkError> {
        self.client.delete_content(&server, target.into()).await
    }

    /// Mark notifications up to `last_seen` as read on every server.
    pub async fn acknowledge_notifications(&self, last_seen: records::EventKey) {
        self.client
            .acknowledge_notifications(last_seen.into())
            .await
    }

    pub async fn register_push_notifications(
        &self,
        servers: Vec<String>,
        request: records::RegisterPushNotificationRequest,
    ) -> Result<(), SdkError> {
        self.client
            .register_push_notifications(servers, request.into())
            .await
    }

    // ── Migration ───────────────────────────────────────────────────

    /// Bring data from an older store into this client's storage: signed
    /// events exactly as stored (each must verify), serialized content
    /// exactly as stored (stored under its digest), and logins. Anything
    /// already stored is skipped. Signs in as `active` if nothing is
    /// signed in.
    pub async fn import_legacy_data(
        &self,
        events: Vec<LegacyEvent>,
        contents: Vec<Vec<u8>>,
        logins: Vec<LegacyLogin>,
        active: Option<LoginId>,
    ) -> Result<(), SdkError> {
        let events = events
            .into_iter()
            .map(|e| pb::SignedEvent {
                signature: e.signature,
                event_bytes: e.event_bytes,
            })
            .collect();
        let contents = contents
            .into_iter()
            .map(|bytes| (crate::sdk::client::content_digest_of_bytes(&bytes), bytes))
            .collect();
        let logins = logins
            .into_iter()
            .map(|l| {
                Ok(crate::sdk::logins::ImportedLogin {
                    identity: l.identity,
                    key_pair: KeyPair::from_private_key(l.key_type.into(), &l.private_key)?,
                    status: l.status,
                })
            })
            .collect::<SdkResult<Vec<_>>>()?;
        self.client
            .import(events, contents, logins, active.map(Into::into))
            .await
    }
}

impl HarborClient {
    async fn pending_login(&self, login: LoginId) -> SdkResult<PendingLogin> {
        let details = self
            .client
            .get_login_details(login.into())
            .await?
            .ok_or_else(|| SdkError::NotFound("login".into()))?;
        Ok(PendingLogin {
            id: details.id,
            status: details.status,
            key_pair: details.key_pair,
        })
    }
}

fn event_key_of(signed: &pb::SignedEvent) -> SdkResult<records::EventKey> {
    Ok(pb::Event::decode(signed.event_bytes.as_slice())?
        .key
        .ok_or_else(|| SdkError::Decode("event has no key".into()))?
        .into())
}
