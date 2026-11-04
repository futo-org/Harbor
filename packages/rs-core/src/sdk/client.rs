//! [`Client`]: lifecycle, session, and the local views of the protocol
//! engine. The rest of `impl Client` is split by concern across the
//! sibling modules.

use std::sync::{Arc, Mutex, RwLock, Weak};

use polycentric_common::jwt::{DEFAULT_EXPIRY_SECONDS, mint_jwt};
use polycentric_common::models::protos_v2::{
    Application, Content, ContentDigest, EventBundle, EventKey, Identity, ListEventsResponse,
    SignedEvent,
};
use polycentric_common::models::traits::Serializable;
use prost::Message;

use crate::api::PolycentricCore;
use crate::client::PolycentricClient;
use crate::lock::{LockRecover, RwLockRecover};
use crate::query::auth::{AuthToken, AuthTokenProvider};
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::events::{ClientEvent, EventBus, Listener, LoginInfo};
use crate::sdk::keys::{KeyCipher, KeyPair, KeyVault};
use crate::sdk::storage::{HYDRATION_PAGE_SIZE, LoginId, Storage};
use crate::sdk::types::{
    ActiveLogin, ClientState, HydrationStatus, IdentityState, InitializationStep,
};
use crate::time::now_secs;

/// How the client is set up.
pub struct ClientConfig {
    pub storage: Arc<dyn Storage>,
    /// Seals private keys at rest. Required for persistent storage; only
    /// in-memory storage may keep keys inline.
    pub key_cipher: Option<Arc<dyn KeyCipher>>,
    /// Servers to use until the active identity names its own.
    pub seed_servers: Vec<String>,
    /// Stamped on every event this client builds.
    pub application: Option<Application>,
    /// False when storage won't survive a restart (e.g. an in-memory
    /// fallback). UIs shouldn't offer identity creation then.
    pub persistent: bool,
}

pub(crate) struct Status {
    pub state: ClientState,
    pub step: InitializationStep,
    pub hydration: HydrationStatus,
    pub error: Option<String>,
}

pub(crate) struct Session {
    pub login: Option<ActiveLogin>,
    pub login_status: Option<crate::sdk::storage::LoginStatus>,
    pub servers: Vec<String>,
}

pub(crate) struct Inner {
    pub core: Arc<PolycentricCore>,
    pub storage: Arc<dyn Storage>,
    pub vault: KeyVault,
    pub application: Option<Application>,
    pub persistent: bool,
    pub session: RwLock<Session>,
    pub status: RwLock<Status>,
    pub events: EventBus,
    pub live_sync: Mutex<Option<crate::sdk::sync::LiveSync>>,
    /// Digests of the pairing sessions this client issued, by their sha256
    /// (the id in `PairingInfo`), so hosts can refer to a session by id.
    pub pairing_digests: Mutex<std::collections::HashMap<Vec<u8>, Vec<u8>>>,
}

/// A Harbor client: the protocol engine plus local storage, keys, and the
/// workflows built on them. Cheap to clone; clones share state.
#[derive(Clone)]
pub struct Client {
    pub(crate) inner: Arc<Inner>,
}

/// Mints server JWTs for whoever is signed in.
struct SessionTokens(Weak<Inner>);

#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
impl AuthTokenProvider for SessionTokens {
    async fn auth_token(&self, server_url: String) -> Option<AuthToken> {
        let inner = self.0.upgrade()?;
        let login = inner.session.read_recover().login.clone()?;
        let now = now_secs();
        Some(AuthToken {
            token: mint_jwt(
                &login.key_pair.seed(),
                &login.id.identity,
                &server_url,
                now,
                DEFAULT_EXPIRY_SECONDS,
            ),
            expires_at: now + DEFAULT_EXPIRY_SECONDS,
        })
    }
}

impl Client {
    /// Create a client, hydrate the protocol engine from storage, and
    /// restore the stored active login.
    pub async fn open(config: ClientConfig) -> SdkResult<Client> {
        if config.persistent && config.key_cipher.is_none() {
            return Err(SdkError::InvalidInput(
                "persistent storage needs a key cipher to keep private keys sealed at rest".into(),
            ));
        }
        let core = PolycentricCore::new();
        let inner = Arc::new(Inner {
            core,
            storage: config.storage,
            vault: KeyVault::new(config.key_cipher),
            application: config.application,
            persistent: config.persistent,
            session: RwLock::new(Session {
                login: None,
                login_status: None,
                servers: config.seed_servers,
            }),
            status: RwLock::new(Status {
                state: ClientState::Uninitialized,
                step: InitializationStep::Starting,
                hydration: HydrationStatus::NotStarted,
                error: None,
            }),
            events: EventBus::default(),
            live_sync: Mutex::new(None),
            pairing_digests: Mutex::new(std::collections::HashMap::new()),
        });
        inner
            .core
            .set_auth_token_provider(Arc::new(SessionTokens(Arc::downgrade(&inner))));

        let client = Client { inner };
        client.initialize().await?;
        Ok(client)
    }

    async fn initialize(&self) -> SdkResult<()> {
        self.set_state(ClientState::Initializing);
        self.set_step(InitializationStep::Starting);
        let result = async {
            self.set_step(InitializationStep::HydratingEvents);
            self.set_hydration(HydrationStatus::InProgress);
            if let Err(e) = self.hydrate().await {
                self.set_hydration(HydrationStatus::Failed);
                return Err(e);
            }
            self.set_hydration(HydrationStatus::Completed);

            self.set_step(InitializationStep::RestoringLogin);
            self.seal_inline_keys().await?;
            self.restore_login().await?;
            self.refresh_servers();
            self.set_step(InitializationStep::Complete);
            Ok(())
        }
        .await;

        match result {
            Ok(()) => {
                self.set_state(ClientState::Ready);
                Ok(())
            }
            Err(e) => {
                self.inner.status.write_recover().error = Some(e.to_string());
                self.set_state(ClientState::Error);
                self.emit(ClientEvent::Error(e.to_string()));
                Err(e)
            }
        }
    }

    /// Copy everything in storage into the protocol engine, which keeps
    /// only what it's given in memory.
    async fn hydrate(&self) -> SdkResult<()> {
        let storage = &self.inner.storage;
        let mut cursor = None;
        loop {
            let page = storage.contents_page(cursor, HYDRATION_PAGE_SIZE).await?;
            {
                let mut core = self.engine().lock_recover();
                for (digest, bytes) in page.items {
                    if let Err(e) = core.copy_content(&digest, bytes) {
                        crate::logging::log_warn(|| format!("hydrate: dropping content: {e:?}"));
                    }
                }
            }
            match page.next {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }

        let mut cursor = None;
        loop {
            let page = storage.events_page(cursor, HYDRATION_PAGE_SIZE).await?;
            {
                let mut core = self.engine().lock_recover();
                for event in page.items {
                    // Re-verify: storage may have been written by older code.
                    match SignedEvent::from_bytes(&event.encode_to_vec()) {
                        Ok(event) => {
                            if let Err(e) = core.copy_event(event) {
                                crate::logging::log_warn(|| {
                                    format!("hydrate: dropping event: {e:?}")
                                });
                            }
                        }
                        Err(e) => {
                            crate::logging::log_warn(|| format!("hydrate: invalid event: {e:?}"))
                        }
                    }
                }
            }
            match page.next {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        Ok(())
    }

    /// Seal any private keys stored inline (by older stores, or before a
    /// cipher was configured).
    async fn seal_inline_keys(&self) -> SdkResult<()> {
        if !self.inner.vault.has_cipher() {
            return Ok(());
        }
        let storage = &self.inner.storage;
        for login in storage.list_logins(None).await? {
            let Some(stored) = storage.get_login(login.id.clone()).await? else {
                continue;
            };
            if let crate::sdk::storage::StoredPrivateKey::Inline(_) = stored.private_key {
                let key_pair = self
                    .inner
                    .vault
                    .open(login.id.public_key.key_type, &stored.private_key)
                    .await?;
                let sealed = self.inner.vault.seal(&key_pair).await?;
                storage.set_login_key(login.id, sealed).await?;
            }
        }
        Ok(())
    }

    async fn restore_login(&self) -> SdkResult<()> {
        let Some(id) = self.inner.storage.active_login().await? else {
            return Ok(());
        };
        if let Err(e) = self.login_as(Some(id), false).await {
            // A stored login that can't be opened (deleted, or its key can't
            // be unsealed) leaves the client signed out rather than broken.
            crate::logging::log_warn(|| format!("could not restore login: {e}"));
        }
        Ok(())
    }

    // ── Accessors ───────────────────────────────────────────────────

    /// The protocol engine, for queries.
    pub fn core(&self) -> Arc<PolycentricCore> {
        self.inner.core.clone()
    }

    pub(crate) fn engine(&self) -> &Arc<Mutex<PolycentricClient>> {
        &self.inner.core.client
    }

    pub fn storage(&self) -> &Arc<dyn Storage> {
        &self.inner.storage
    }

    pub fn state(&self) -> ClientState {
        self.inner.status.read_recover().state
    }

    pub fn step(&self) -> InitializationStep {
        self.inner.status.read_recover().step
    }

    pub fn hydration_status(&self) -> HydrationStatus {
        self.inner.status.read_recover().hydration
    }

    pub fn error(&self) -> Option<String> {
        self.inner.status.read_recover().error.clone()
    }

    pub fn is_persistent(&self) -> bool {
        self.inner.persistent
    }

    pub fn application(&self) -> Option<Application> {
        self.inner.application.clone()
    }

    /// The signed-in login, private key included.
    pub fn active_login(&self) -> Option<ActiveLogin> {
        self.inner.session.read_recover().login.clone()
    }

    /// The signed-in login's status when it signed in.
    pub fn active_login_status(&self) -> Option<crate::sdk::storage::LoginStatus> {
        self.inner.session.read_recover().login_status
    }

    pub fn active_identity(&self) -> Option<String> {
        self.inner
            .session
            .read_recover()
            .login
            .as_ref()
            .map(|l| l.id.identity.clone())
    }

    pub(crate) fn require_login(&self) -> SdkResult<ActiveLogin> {
        self.active_login().ok_or(SdkError::NoActiveIdentity)
    }

    pub fn servers(&self) -> Vec<String> {
        self.inner.session.read_recover().servers.clone()
    }

    /// Use `servers` until the active identity's document says otherwise.
    pub fn set_servers(&self, servers: Vec<String>) {
        self.inner.session.write_recover().servers = servers.clone();
        self.inner.core.set_servers(servers);
        self.emit(ClientEvent::ServersChanged);
    }

    /// Adopt the active identity's server list, if it has one, and hand
    /// the list to the protocol engine.
    pub fn refresh_servers(&self) {
        let mut changed = false;
        if let Some(servers) = self.resolve_identity(None).and_then(|s| s.servers) {
            let mut session = self.inner.session.write_recover();
            changed = session.servers != servers;
            session.servers = servers;
        }
        let servers = self.servers();
        self.inner.core.set_servers(servers);
        if changed {
            self.emit(ClientEvent::ServersChanged);
        }
    }

    // ── Events ──────────────────────────────────────────────────────

    pub fn add_listener(&self, listener: Listener) -> u64 {
        self.inner.events.add(listener)
    }

    pub fn remove_listener(&self, id: u64) {
        self.inner.events.remove(id)
    }

    pub(crate) fn emit(&self, event: ClientEvent) {
        self.inner.events.emit(event)
    }

    fn set_state(&self, state: ClientState) {
        self.inner.status.write_recover().state = state;
        self.emit(ClientEvent::StateChanged(state));
    }

    fn set_step(&self, step: InitializationStep) {
        self.inner.status.write_recover().step = step;
        self.emit(ClientEvent::Progress(step));
    }

    fn set_hydration(&self, status: HydrationStatus) {
        self.inner.status.write_recover().hydration = status;
        self.emit(ClientEvent::HydrationStatus(status));
    }

    // ── Session ─────────────────────────────────────────────────────

    /// Sign in as `login`, or sign out with `None`. With `persist`, it's
    /// also remembered as the login to restore next time.
    pub async fn login_as(&self, login: Option<LoginId>, persist: bool) -> SdkResult<()> {
        let active = match login {
            None => None,
            Some(id) => {
                let stored = self
                    .inner
                    .storage
                    .get_login(id.clone())
                    .await?
                    .ok_or_else(|| SdkError::NotFound("login".into()))?;
                let key_pair = self
                    .inner
                    .vault
                    .open(id.public_key.key_type, &stored.private_key)
                    .await?;
                Some((ActiveLogin { id, key_pair }, stored.status))
            }
        };

        if persist {
            let id = active.as_ref().map(|(a, _)| a.id.clone());
            self.inner.storage.set_active_login(id).await?;
        }

        let info = active.as_ref().map(|(a, status)| LoginInfo {
            identity: a.id.identity.clone(),
            public_key: a.id.public_key.clone(),
            status: *status,
        });
        let identity = active.as_ref().map(|(a, _)| a.id.identity.clone());

        {
            let mut session = self.inner.session.write_recover();
            session.login_status = active.as_ref().map(|(_, status)| *status);
            session.login = active.map(|(a, _)| a);
        }
        self.inner.core.clear_auth_tokens();
        self.inner.core.set_active_identity(identity);
        self.refresh_servers();
        self.emit(ClientEvent::LoginChanged(info));
        Ok(())
    }

    /// The login storage will restore at startup.
    pub async fn stored_active_login(&self) -> SdkResult<Option<LoginId>> {
        self.inner.storage.active_login().await
    }

    /// A JWT authenticating the active identity to `audience`.
    pub fn mint_server_jwt(&self, audience: &str) -> SdkResult<String> {
        let login = self.require_login()?;
        Ok(mint_jwt(
            &login.key_pair.seed(),
            &login.id.identity,
            audience,
            now_secs(),
            DEFAULT_EXPIRY_SECONDS,
        ))
    }

    // ── Local reads ─────────────────────────────────────────────────

    /// The latest known state of `identity` (default: the active one),
    /// from what's held locally.
    pub fn resolve_identity(&self, identity: Option<&str>) -> Option<IdentityState> {
        let identity = match identity {
            Some(i) => i.to_string(),
            None => self.active_identity()?,
        };
        let core = self.engine().lock_recover();
        let chain = core.identity_chain(&identity).ok()?;
        let doc: Identity = chain.latest_state()?.clone();
        Some(IdentityState::from_document(identity, doc))
    }

    /// The identity chain of `identity`, oldest first.
    pub fn resolve_identity_chain(&self, identity: &str) -> SdkResult<Vec<EventBundle>> {
        Ok(self
            .engine()
            .lock_recover()
            .identity_chain_bundles(identity)?)
    }

    /// Non-deleted bundles of one stream, from what's held locally.
    pub fn list_valid_events(
        &self,
        identity: &str,
        collection: i32,
    ) -> SdkResult<Vec<EventBundle>> {
        Ok(self
            .engine()
            .lock_recover()
            .list_valid_events(identity, collection)?)
    }

    /// Identities the active identity blocks.
    pub fn blocked_identities(&self) -> Vec<String> {
        self.engine()
            .lock_recover()
            .blocked_identities()
            .iter()
            .cloned()
            .collect()
    }

    /// Heads of the events held locally for `identity`.
    pub fn local_heads(&self, identity: &str) -> Vec<EventKey> {
        self.engine().lock_recover().local_heads(identity)
    }

    /// Copy events and content into the protocol engine without storing
    /// them (e.g. a backup's identity chain).
    pub fn absorb_bundles(&self, bundles: Vec<EventBundle>) {
        self.engine().lock_recover().copy_bundles(bundles);
    }

    /// Copy signed events into the protocol engine without storing them.
    /// Used to mirror commits made by another client sharing this storage.
    pub fn absorb_events(&self, events: Vec<SignedEvent>, contents: Vec<(ContentDigest, Vec<u8>)>) {
        let mut core = self.engine().lock_recover();
        for (digest, bytes) in contents {
            let _ = core.copy_content(&digest, bytes);
        }
        for event in events {
            if let Ok(event) = SignedEvent::from_bytes(&event.encode_to_vec()) {
                let _ = core.copy_event(event);
            }
        }
    }

    /// One-shot ListEvents across the configured servers (or
    /// `opts.servers`), cached under `query_key` when given. Results also
    /// land in the protocol engine.
    pub async fn list_events(
        &self,
        args: crate::query::event::ListEventsArgs,
        query_key: Option<crate::query::QueryKey>,
        opts: Option<crate::query::QueryOpts>,
    ) -> SdkResult<Vec<EventBundle>> {
        let bytes = self
            .inner
            .core
            .await_query(crate::api::Query::ListEvents(args), query_key, opts)
            .await?;
        Ok(match bytes {
            Some(bytes) => ListEventsResponse::decode(bytes.as_slice())?.event_bundles,
            None => Vec::new(),
        })
    }
}

/// Query options that only pick servers.
pub(crate) fn on_servers(servers: Option<Vec<String>>) -> Option<crate::query::QueryOpts> {
    servers.map(|servers| crate::query::QueryOpts {
        servers: Some(servers),
        ..Default::default()
    })
}

/// The sha256 digest of serialized content.
pub fn content_digest(content: &Content) -> ContentDigest {
    content_digest_of_bytes(&content.encode_to_vec())
}

pub fn content_digest_of_bytes(bytes: &[u8]) -> ContentDigest {
    use sha2::{Digest, Sha256};
    ContentDigest {
        r#type: polycentric_common::models::protos_v2::ContentDigestType::Sha256 as i32,
        value: Sha256::digest(bytes).to_vec(),
    }
}

/// Key pair helpers re-exported for hosts.
pub fn generate_key_pair() -> SdkResult<KeyPair> {
    KeyPair::generate()
}
