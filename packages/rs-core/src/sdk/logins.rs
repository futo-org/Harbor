//! Logins: creating identities, pairing and recovering into existing ones,
//! and the local list of key pairs.

use polycentric_common::models::collections;
use polycentric_common::models::identity::assemble_recovery_payload;
use polycentric_common::models::protos_v2::{
    Content, Event, EventKey, Identity, IdentityBackup, ServerList, VectorClock,
    content::ContentBody,
};

use crate::query::event::ListEventsArgs;
use crate::sdk::client::{Client, content_digest_of_bytes};
use crate::sdk::commit::sign_event_with;
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::keys::{KeyPair, keys_equal};
use crate::sdk::storage::{LoginId, LoginOverview, LoginStatus, StoredLogin};
use crate::sdk::types::{
    IdentityState, IdentityUpdate, KeyPower, LoginDetails, LoginKind, PendingLogin, PublishArgs,
    SignupInfo, SyncStrategy,
};
use crate::time::now_millis;

impl Client {
    // ── Local login records ─────────────────────────────────────────

    pub async fn list_logins(&self, identity: Option<String>) -> SdkResult<Vec<LoginOverview>> {
        if let Some(identity) = &identity {
            check_identity(identity)?;
        }
        self.inner.storage.list_logins(identity).await
    }

    /// A login with its private key, if it exists.
    pub async fn get_login_details(&self, id: LoginId) -> SdkResult<Option<LoginDetails>> {
        check_identity(&id.identity)?;
        let Some(stored) = self.inner.storage.get_login(id.clone()).await? else {
            return Ok(None);
        };
        let key_pair = self
            .inner
            .vault
            .open(id.public_key.key_type, &stored.private_key)
            .await?;
        Ok(Some(LoginDetails {
            id,
            status: stored.status,
            key_pair,
        }))
    }

    /// Store a new login. Fails if this identity already has it.
    pub async fn put_login(
        &self,
        identity: &str,
        key_pair: &KeyPair,
        status: LoginStatus,
    ) -> SdkResult<LoginId> {
        check_identity(identity)?;
        let id = LoginId {
            identity: identity.to_string(),
            public_key: key_pair.public_key(),
        };
        let private_key = self.inner.vault.seal(key_pair).await?;
        self.inner
            .storage
            .put_login(StoredLogin {
                id: id.clone(),
                status,
                private_key,
            })
            .await?;
        Ok(id)
    }

    pub async fn change_login_status(&self, id: LoginId, status: LoginStatus) -> SdkResult<()> {
        check_identity(&id.identity)?;
        self.inner.storage.set_login_status(id, status).await
    }

    pub async fn delete_login(&self, id: LoginId) -> SdkResult<()> {
        check_identity(&id.identity)?;
        let signed_in = self.active_login().is_some_and(|l| l.id == id);
        self.inner.storage.delete_login(id).await?;
        if signed_in {
            self.login_as(None, true).await?;
        }
        Ok(())
    }

    // ── Signup ──────────────────────────────────────────────────────

    /// Generate a key pair and store it as a pending signup.
    pub async fn begin_signup(&self) -> SdkResult<SignupInfo> {
        self.begin_signup_with(KeyPair::generate()?).await
    }

    /// [`Client::begin_signup`] with a given key pair.
    pub async fn begin_signup_with(&self, key_pair: KeyPair) -> SdkResult<SignupInfo> {
        let info = self.derive_signup_info(key_pair)?;
        self.put_login(
            &info.login.identity,
            &info.key_pair,
            LoginStatus::PendingSignup,
        )
        .await?;
        Ok(info)
    }

    /// Mark a signup's login as a live rotation key.
    pub async fn finish_signup(&self, login: LoginId) -> SdkResult<()> {
        self.change_login_status(login, LoginStatus::LiveRotationKey)
            .await
    }

    /// The identity, genesis event and content a key pair would create.
    /// Writes nothing; prefer [`Client::begin_signup`].
    pub fn derive_signup_info(&self, key_pair: KeyPair) -> SdkResult<SignupInfo> {
        let identity = Identity {
            rotation_keys: vec![key_pair.public_key()],
            servers: Some(ServerList {
                urls: self.servers(),
            }),
            ..Default::default()
        };
        let identity_key = identity.derive_hex_key();
        debug_assert_eq!(identity_key, identity_key_for(&key_pair, self.servers()));
        let content = prost::Message::encode_to_vec(&Content {
            content_body: Some(ContentBody::Identity(identity)),
        });

        // The bootstrap event: sequence 1 and a one-entry vector clock.
        let event = Event {
            key: Some(EventKey {
                collection: collections::IDENTITY,
                identity: identity_key.clone(),
                signed_by: Some(key_pair.public_key()),
                sequence: 1,
            }),
            identity_sequence: 1,
            vector_clock: Some(VectorClock { sequence: vec![1] }),
            content_digest: Some(content_digest_of_bytes(&content)),
            created_at: now_millis(),
            application: self.inner.application.clone(),
            ..Default::default()
        };
        let genesis_event = sign_event_with(&event, &key_pair)?;

        Ok(SignupInfo {
            login: LoginId {
                identity: identity_key,
                public_key: key_pair.public_key(),
            },
            key_pair,
            genesis_event,
            identity_content: content,
        })
    }

    /// Create and publish a new identity and sign in as it. `server` is
    /// added to the server list first if given.
    pub async fn create_identity(&self, server: Option<String>) -> SdkResult<LoginId> {
        self.create_identity_with(KeyPair::generate()?, server)
            .await
    }

    /// [`Client::create_identity`] with a given key pair, e.g. a fixed one
    /// for test users. The identity is a function of the key and servers.
    pub async fn create_identity_with(
        &self,
        key_pair: KeyPair,
        server: Option<String>,
    ) -> SdkResult<LoginId> {
        if let Some(server) = server {
            let mut servers = self.servers();
            if !servers.contains(&server) {
                servers.push(server);
                self.set_servers(servers);
            }
        }
        let info = self.begin_signup_with(key_pair).await?;
        self.commit_event(info.genesis_event, Some(info.identity_content))
            .await?;
        self.finish_signup(info.login.clone()).await?;
        self.login_as(Some(info.login.clone()), true).await?;
        if let Err(e) = self.sync(SyncStrategy::PartialPush).await {
            crate::logging::log_warn(|| format!("push after signup failed: {e}"));
        }
        Ok(info.login)
    }

    // ── Pairing and recovery ────────────────────────────────────────

    /// Generate a key pair and store it as a pending login for `identity`.
    pub async fn begin_login(&self, identity: &str, kind: LoginKind) -> SdkResult<PendingLogin> {
        let key_pair = KeyPair::generate()?;
        let status = match kind {
            LoginKind::Pair => LoginStatus::PendingPair,
            LoginKind::Recovery => LoginStatus::PendingRecovery,
        };
        let id = self.put_login(identity, &key_pair, status).await?;
        Ok(PendingLogin {
            id,
            status,
            key_pair,
        })
    }

    /// Mark a login live with `power`.
    pub async fn finish_login(&self, login: LoginId, power: KeyPower) -> SdkResult<()> {
        self.change_login_status(login, power.live_status()).await
    }

    /// Publish an identity event signed by `key_pair`, mark its login live
    /// and sign in as it. Doesn't check the chain authorizes the key beyond
    /// the new document listing it.
    pub async fn publish_login(
        &self,
        identity_key: &str,
        key_pair: &KeyPair,
        args: PublishArgs,
    ) -> SdkResult<IdentityUpdate> {
        let (identity, content) = draft_identity_content(args);
        let content = prost::Message::encode_to_vec(&content);
        let public_key = key_pair.public_key();
        let state = IdentityState::from_document(identity_key.to_string(), identity);
        let power = state.power_of(&public_key).ok_or_else(|| {
            SdkError::Unauthorized("key is not authorized by the identity".into())
        })?;

        self.save_content(&content).await?;
        let event = self
            .build_event(
                &content,
                collections::IDENTITY,
                Some(identity_key.to_string()),
                Some(public_key.clone()),
            )
            .await?;
        let signed_event = sign_event_with(&event, key_pair)?;
        self.commit_event(signed_event.clone(), Some(content))
            .await?;

        // The identity event authorizing us is stored; commit to the switch.
        let login = LoginId {
            identity: identity_key.to_string(),
            public_key,
        };
        self.finish_login(login.clone(), power).await?;
        self.login_as(Some(login), true).await?;

        if let Err(e) = self.sync(SyncStrategy::PartialPush).await {
            crate::logging::log_warn(|| format!("push after login failed: {e}"));
        }
        Ok(IdentityUpdate {
            identity_key: identity_key.to_string(),
            signed_event,
        })
    }

    /// Claim an identity that has authorized `pending`'s key: fetch its
    /// chain, check the authorization, store the chain, and re-publish the
    /// identity document signed by our key. Pulls the identity's other
    /// events in the background.
    pub async fn claim(
        &self,
        pending: PendingLogin,
        servers: Option<Vec<String>>,
    ) -> SdkResult<IdentityState> {
        let identity_key = pending.id.identity.clone();
        self.list_events(
            identity_events_args(&identity_key),
            None,
            crate::sdk::client::on_servers(servers),
        )
        .await?;

        let state = self
            .resolve_identity(Some(&identity_key))
            .filter(|s| s.power_of(&pending.key_pair.public_key()).is_some())
            .ok_or_else(|| SdkError::Unauthorized("unable to verify authorization".into()))?;

        let chain = self.resolve_identity_chain(&identity_key)?;
        self.save_bundles(chain).await?;
        self.publish_login(&identity_key, &pending.key_pair, state.to_publish_args())
            .await?;

        let client = self.clone();
        crate::query::client::spawn(async move {
            if let Err(e) = client.sync(SyncStrategy::PartialPull).await {
                crate::logging::log_warn(|| format!("pull after claim failed: {e}"));
            }
        });
        Ok(state)
    }

    /// Copy a backup's identity chain into the protocol engine (not
    /// storage), so resolving the identity accounts for it.
    pub fn copy_backup_events(&self, backup: &IdentityBackup) {
        self.absorb_bundles(backup.identity_chain.clone());
    }

    /// Ask every relevant server for `identity_key`'s identity events,
    /// following server lists the events reveal.
    async fn discover_remote_identity_events(&self, identity_key: &str) {
        let mut queried = std::collections::HashSet::new();
        loop {
            let servers = self
                .resolve_identity(Some(identity_key))
                .and_then(|s| s.servers)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| self.servers());
            let to_query: Vec<String> = servers
                .into_iter()
                .filter(|s| !queried.contains(s))
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect();
            if to_query.is_empty() {
                break;
            }
            if let Err(e) = self
                .list_events(
                    identity_events_args(identity_key),
                    None,
                    crate::sdk::client::on_servers(Some(to_query.clone())),
                )
                .await
            {
                crate::logging::log_warn(|| format!("listing identity events failed: {e}"));
            }
            queried.extend(to_query);
        }
    }

    /// Use `backup` to authorize `key_pair` as a rotation key and sign in.
    pub async fn recover_identity(
        &self,
        key_pair: &KeyPair,
        backup: &IdentityBackup,
    ) -> SdkResult<()> {
        let identity_key = backup.identity_key.clone();
        let recovery_private = backup
            .recovery_key
            .as_ref()
            .ok_or_else(|| SdkError::InvalidInput("backup has no recovery key".into()))?;

        self.copy_backup_events(backup);
        self.resolve_identity(Some(&identity_key))
            .ok_or_else(|| SdkError::InvalidInput("backup has no valid identity chain".into()))?;

        self.discover_remote_identity_events(&identity_key).await;

        let state = self
            .resolve_identity(Some(&identity_key))
            .ok_or_else(|| SdkError::NotFound("no valid identity chain to recover".into()))?;
        if !self.check_recovery_key(recovery_private, Some(&identity_key)) {
            return Err(SdkError::Unauthorized(
                "unable to recover this identity with this backup".into(),
            ));
        }

        let public_key = key_pair.public_key();
        let payload = assemble_recovery_payload(&identity_key, &public_key);
        let recovery_signature = KeyPair::from_private_key_proto(recovery_private)?.sign(&payload);

        let mut args = state.to_publish_args();
        if !args
            .rotation_keys
            .iter()
            .any(|k| keys_equal(k, &public_key))
        {
            args.rotation_keys.push(public_key);
        }
        args.recovery_signature = Some(recovery_signature);

        let chain = self.resolve_identity_chain(&identity_key)?;
        self.save_bundles(chain).await?;
        self.publish_login(&identity_key, key_pair, args).await?;

        if let Err(e) = self.sync(SyncStrategy::PartialPull).await {
            crate::logging::log_warn(|| format!("pull after recovery failed: {e}"));
        }
        Ok(())
    }
}

fn identity_events_args(identity: &str) -> ListEventsArgs {
    ListEventsArgs {
        size: None,
        identity: identity.to_string(),
        collection: Some(collections::IDENTITY),
        signed_by: None,
        sequence_gt: None,
        sequence_lt: None,
        heads: None,
    }
}

/// The identity a new identity created with `key_pair` on `servers` gets.
pub fn identity_key_for(key_pair: &KeyPair, servers: Vec<String>) -> String {
    Identity {
        rotation_keys: vec![key_pair.public_key()],
        servers: Some(ServerList { urls: servers }),
        ..Default::default()
    }
    .derive_hex_key()
}

/// An identity document and its content for `args`.
pub fn draft_identity_content(args: PublishArgs) -> (Identity, Content) {
    let identity = Identity {
        rotation_keys: args.rotation_keys,
        signing_keys: args.signing_keys,
        revocation_bounds: args.revocation_bounds,
        servers: args.servers.map(|urls| ServerList { urls }),
        recovery_key: args.recovery_key,
        recovery_signature: args.recovery_signature,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity.clone())),
    };
    (identity, content)
}

/// Identity keys are 32 bytes of lowercase hex.
pub(crate) fn check_identity(identity: &str) -> SdkResult<()> {
    if identity.len() == 64
        && identity
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        Ok(())
    } else {
        Err(SdkError::InvalidInput(
            "identity must be a 32 byte lowercase hex string".into(),
        ))
    }
}

/// A login read from an older store, for [`Client::import`].
#[derive(Clone, Debug)]
pub struct ImportedLogin {
    pub identity: String,
    pub key_pair: KeyPair,
    pub status: LoginStatus,
}

impl Client {
    /// Bring data from an older store (e.g. the web's IndexedDB) into this
    /// client's storage. Events must verify and content must match its
    /// digest; anything already stored is skipped. When `active` is given
    /// and nothing is signed in, signs in as it.
    pub async fn import(
        &self,
        events: Vec<polycentric_common::models::protos_v2::SignedEvent>,
        contents: Vec<(
            polycentric_common::models::protos_v2::ContentDigest,
            Vec<u8>,
        )>,
        logins: Vec<ImportedLogin>,
        active: Option<LoginId>,
    ) -> SdkResult<()> {
        use polycentric_common::models::traits::Serializable;
        use prost::Message;

        let contents: Vec<_> = contents
            .into_iter()
            .filter(|(digest, bytes)| digest.verify_against(bytes).is_ok())
            .collect();
        let events: Vec<_> = events
            .into_iter()
            .filter_map(|e| {
                polycentric_common::models::protos_v2::SignedEvent::from_bytes(&e.encode_to_vec())
                    .ok()
            })
            .collect();
        self.inner.storage.put_contents(contents.clone()).await?;
        self.inner.storage.put_events(events.clone()).await?;
        self.absorb_events(events, contents);

        for login in logins {
            match self
                .put_login(&login.identity, &login.key_pair, login.status)
                .await
            {
                Ok(_) | Err(SdkError::AlreadyExists(_)) => {}
                Err(e) => return Err(e),
            }
        }

        if let Some(active) = active
            && self.active_login().is_none()
        {
            self.login_as(Some(active), true).await?;
        }
        Ok(())
    }
}
