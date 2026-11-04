//! Updating the active identity's document.

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{PrivateKey, PublicKey, SignedEvent};

use crate::sdk::client::Client;
use crate::sdk::error::{SdkError, SdkResult};
use crate::sdk::keys::{KeyPair, keys_equal};
use crate::sdk::logins::draft_identity_content;
use crate::sdk::types::{IdentityState, IdentityUpdate, KeyPower, PublishArgs, SyncStrategy};

impl Client {
    /// Publish a new document for the active identity. The active key must
    /// be one of its rotation keys.
    pub async fn publish_identity_update(&self, args: PublishArgs) -> SdkResult<IdentityUpdate> {
        let login = self.require_login()?;
        let identity_key = login.id.identity.clone();
        let current = self
            .resolve_identity(Some(&identity_key))
            .ok_or_else(|| SdkError::NotFound("no identity chain to extend".into()))?;
        if current.power_of(&login.key_pair.public_key()) != Some(KeyPower::Rotation) {
            return Err(SdkError::Unauthorized(
                "this key pair is not authorized for identity rotation".into(),
            ));
        }

        let (_, content) = draft_identity_content(args);
        let content = prost::Message::encode_to_vec(&content);
        self.save_content(&content).await?;
        let signed_event = self.publish(&content, collections::IDENTITY).await?;
        self.refresh_servers();

        if let Err(e) = self.sync(SyncStrategy::PartialPush).await {
            crate::logging::log_warn(|| format!("push after identity update failed: {e}"));
        }
        Ok(IdentityUpdate {
            identity_key,
            signed_event,
        })
    }

    fn require_identity_state(&self) -> SdkResult<IdentityState> {
        self.resolve_identity(None)
            .ok_or(SdkError::NoActiveIdentity)
    }

    pub fn is_rotation_key_for_identity(&self, identity: &str, key: &PublicKey) -> bool {
        self.resolve_identity(Some(identity))
            .is_some_and(|s| s.power_of(key) == Some(KeyPower::Rotation))
    }

    pub async fn add_signing_key(&self, key: PublicKey) -> SdkResult<SignedEvent> {
        let mut args = self.require_identity_state()?.to_publish_args();
        args.signing_keys.push(key);
        Ok(self.publish_identity_update(args).await?.signed_event)
    }

    pub async fn remove_signing_key(&self, key: PublicKey) -> SdkResult<SignedEvent> {
        let mut args = self.require_identity_state()?.to_publish_args();
        args.signing_keys.retain(|k| k.key != key.key);
        Ok(self.publish_identity_update(args).await?.signed_event)
    }

    pub async fn add_rotation_key(&self, key: PublicKey) -> SdkResult<SignedEvent> {
        let mut args = self.require_identity_state()?.to_publish_args();
        if args.rotation_keys.iter().any(|k| keys_equal(k, &key)) {
            return Err(SdkError::AlreadyExists("rotation key".into()));
        }
        args.rotation_keys.push(key);
        Ok(self.publish_identity_update(args).await?.signed_event)
    }

    pub async fn remove_rotation_key(&self, key: PublicKey) -> SdkResult<SignedEvent> {
        let mut args = self.require_identity_state()?.to_publish_args();
        args.rotation_keys.retain(|k| !keys_equal(k, &key));
        Ok(self.publish_identity_update(args).await?.signed_event)
    }

    /// Add `url` to the identity's servers. The server must answer
    /// `GetInfo` first.
    pub async fn add_server(&self, url: String) -> SdkResult<SignedEvent> {
        let state = self.require_identity_state()?;
        // An identity that never set a list starts from the client's.
        let mut servers = state.servers.clone().unwrap_or_else(|| self.servers());
        if servers.contains(&url) {
            return Err(SdkError::ServerAlreadyAdded);
        }
        self.inner.core.get_server_info(url.clone()).await?;
        servers.push(url);
        let mut args = state.to_publish_args();
        args.servers = Some(servers);
        Ok(self.publish_identity_update(args).await?.signed_event)
    }

    pub async fn remove_server(&self, url: String) -> SdkResult<SignedEvent> {
        let state = self.require_identity_state()?;
        let current = state.servers.clone().unwrap_or_else(|| self.servers());
        let servers: Vec<String> = current.iter().filter(|s| **s != url).cloned().collect();
        if servers.len() == current.len() {
            return Err(SdkError::NotFound("server".into()));
        }
        let mut args = state.to_publish_args();
        args.servers = Some(servers);
        Ok(self.publish_identity_update(args).await?.signed_event)
    }

    /// Publish a new recovery key and return its private half, which the
    /// caller must keep.
    pub async fn rotate_recovery_key(&self) -> SdkResult<PrivateKey> {
        let mut args = self.require_identity_state()?.to_publish_args();
        let recovery = KeyPair::generate()?;
        args.recovery_key = Some(recovery.public_key());
        self.publish_identity_update(args).await?;
        Ok(recovery.private_key())
    }

    /// Whether `private_key` is the recovery key of `identity` (default:
    /// the active one).
    pub fn check_recovery_key(&self, private_key: &PrivateKey, identity: Option<&str>) -> bool {
        let Ok(key_pair) = KeyPair::from_private_key_proto(private_key) else {
            return false;
        };
        self.resolve_identity(identity)
            .and_then(|s| s.recovery_key)
            .is_some_and(|k| keys_equal(&k, &key_pair.public_key()))
    }
}
