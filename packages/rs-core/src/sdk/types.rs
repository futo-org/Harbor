//! Values the client takes and returns.

use polycentric_common::models::protos_v2::{
    Identity, IssuerPairingState, PairingInfo, PairingSessionDigest, PrivateKey, PublicKey,
    RevocationBound, SignedEvent,
};

use crate::sdk::keys::KeyPair;
use crate::sdk::storage::{LoginId, LoginStatus};
use crate::sync::EventPushIssues;

/// The client's lifecycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum ClientState {
    Uninitialized,
    Initializing,
    Ready,
    Error,
}

/// Steps reported while the client initializes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum InitializationStep {
    Starting,
    SettingUpStorage,
    HydratingEvents,
    RestoringLogin,
    Complete,
}

/// Progress of copying stored events into the protocol engine.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum HydrationStatus {
    NotStarted,
    InProgress,
    Failed,
    Completed,
}

/// How to sync the active identity's events with its servers.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum SyncStrategy {
    /// Push and pull all events.
    Full,
    /// Push all events.
    FullPush,
    /// Pull all events.
    FullPull,
    /// Push and pull only events believed to be missing.
    Partial,
    /// Push only events believed to be missing.
    PartialPush,
    /// Pull only events believed to be missing.
    PartialPull,
}

impl SyncStrategy {
    /// `Some(partial)` when the strategy pulls.
    pub(crate) fn pull(self) -> Option<bool> {
        match self {
            SyncStrategy::Full | SyncStrategy::FullPull => Some(false),
            SyncStrategy::Partial | SyncStrategy::PartialPull => Some(true),
            SyncStrategy::FullPush | SyncStrategy::PartialPush => None,
        }
    }

    /// `Some(partial)` when the strategy pushes.
    pub(crate) fn push(self) -> Option<bool> {
        match self {
            SyncStrategy::Full | SyncStrategy::FullPush => Some(false),
            SyncStrategy::Partial | SyncStrategy::PartialPush => Some(true),
            SyncStrategy::FullPull | SyncStrategy::PartialPull => None,
        }
    }
}

/// What a key is authorized for in an identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum KeyPower {
    Rotation,
    Signing,
}

impl KeyPower {
    pub(crate) fn live_status(self) -> LoginStatus {
        match self {
            KeyPower::Rotation => LoginStatus::LiveRotationKey,
            KeyPower::Signing => LoginStatus::LiveSigningKey,
        }
    }
}

/// Why a login is being started for an existing identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum LoginKind {
    Pair,
    Recovery,
}

/// The signed-in login.
#[derive(Clone, Debug)]
pub struct ActiveLogin {
    pub id: LoginId,
    pub key_pair: KeyPair,
}

/// An identity's latest known state.
#[derive(Clone, Debug, PartialEq)]
pub struct IdentityState {
    /// Hex sha256 of the identity's genesis document.
    pub identity_key: String,
    pub rotation_keys: Vec<PublicKey>,
    pub signing_keys: Vec<PublicKey>,
    /// Bounds keeping pre-revocation events from revoked signers valid.
    pub revocation_bounds: Vec<RevocationBound>,
    /// `None` when the identity never configured a server list (clients use
    /// their defaults); an empty list is intentionally empty.
    pub servers: Option<Vec<String>>,
    /// Used only to sign recovery payloads.
    pub recovery_key: Option<PublicKey>,
}

impl IdentityState {
    pub(crate) fn from_document(identity_key: String, doc: Identity) -> Self {
        Self {
            identity_key,
            rotation_keys: doc.rotation_keys,
            signing_keys: doc.signing_keys,
            revocation_bounds: doc.revocation_bounds,
            servers: doc.servers.map(|s| s.urls),
            recovery_key: doc.recovery_key,
        }
    }

    /// What `key` may do in this identity, if anything.
    pub fn power_of(&self, key: &PublicKey) -> Option<KeyPower> {
        use crate::sdk::keys::keys_equal;
        if self.rotation_keys.iter().any(|k| keys_equal(k, key)) {
            Some(KeyPower::Rotation)
        } else if self.signing_keys.iter().any(|k| keys_equal(k, key)) {
            Some(KeyPower::Signing)
        } else {
            None
        }
    }

    /// These fields as the starting point for an update.
    pub fn to_publish_args(&self) -> PublishArgs {
        PublishArgs {
            rotation_keys: self.rotation_keys.clone(),
            signing_keys: self.signing_keys.clone(),
            servers: self.servers.clone(),
            revocation_bounds: self.revocation_bounds.clone(),
            recovery_key: self.recovery_key.clone(),
            recovery_signature: None,
        }
    }
}

/// The contents of an identity document to publish.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PublishArgs {
    pub rotation_keys: Vec<PublicKey>,
    pub signing_keys: Vec<PublicKey>,
    pub servers: Option<Vec<String>>,
    pub revocation_bounds: Vec<RevocationBound>,
    pub recovery_key: Option<PublicKey>,
    pub recovery_signature: Option<Vec<u8>>,
}

/// A published identity event.
#[derive(Clone, Debug, PartialEq)]
pub struct IdentityUpdate {
    pub identity_key: String,
    pub signed_event: SignedEvent,
}

/// A new identity still being created.
#[derive(Clone, Debug)]
pub struct SignupInfo {
    pub login: LoginId,
    pub key_pair: KeyPair,
    pub genesis_event: SignedEvent,
    /// Serialized `Content`.
    pub identity_content: Vec<u8>,
}

/// A login started for an existing identity.
#[derive(Clone, Debug)]
pub struct PendingLogin {
    pub id: LoginId,
    pub status: LoginStatus,
    pub key_pair: KeyPair,
}

/// A login with its private key.
#[derive(Clone, Debug)]
pub struct LoginDetails {
    pub id: LoginId,
    pub status: LoginStatus,
    pub key_pair: KeyPair,
}

/// A pairing session as a server reports it.
#[derive(Clone, Debug, PartialEq)]
pub struct PairingSession {
    /// The canonical serialized `PairingSessionDigest`.
    pub digest_bytes: Vec<u8>,
    pub digest: PairingSessionDigest,
    /// Issuer state, verified to be signed by the issuer.
    pub issuer_state: IssuerPairingState,
    /// Keys asking to be paired.
    pub claimers: Vec<PublicKey>,
    /// Milliseconds since the Unix epoch.
    pub expires_at_millis: u64,
    /// What a claimer needs to reach this session.
    pub pairing_info: PairingInfo,
}

/// The outcome of pushing an identity's events to one server.
#[derive(Clone, Debug, PartialEq)]
pub struct ServerPushResult {
    /// The identity pushed, which may no longer be the active one.
    pub identity: String,
    pub server: String,
    /// Events the server issued errors or warnings for.
    pub event_issues: Vec<EventPushIssues>,
    /// Set when the push failed outright, e.g. the server was unreachable.
    pub error: Option<String>,
}

/// A private key the caller must keep (e.g. a new recovery key).
pub type ExportedPrivateKey = PrivateKey;
