//! Persistent local storage for the client: events, content, logins, the
//! active login, and blobs.
//!
//! The protocol engine keeps everything it needs in memory; this layer is
//! what survives a restart. The client hydrates the engine from it at
//! startup and writes through it on every commit and pull.

#[cfg(target_arch = "wasm32")]
pub mod node_vfs;
pub mod sqlite;

use polycentric_common::models::protos_v2::{ContentDigest, EventKey, PublicKey, SignedEvent};

use crate::sdk::error::{SdkError, SdkResult};

/// Identifies a login: an identity and one of its key pairs.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct LoginId {
    pub identity: String,
    pub public_key: PublicKey,
}

/// What this device believes about one of its logins. The identity events
/// are always the source of truth; the status decides which events the
/// client creates or expects to receive.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum LoginStatus {
    /// Creating a new identity; its genesis event isn't stored yet.
    PendingSignup,
    /// Pairing to an identity that hasn't authorized this key yet.
    PendingPair,
    /// Recovering an identity from a backup; the recovery event isn't stored yet.
    PendingRecovery,
    /// Authorized to sign events and rotate the identity.
    LiveRotationKey,
    /// Authorized to sign events.
    LiveSigningKey,
    /// Revoked.
    Revoked,
    /// Being deleted; ignored everywhere except sweeps.
    PendingDeletion,
}

impl LoginStatus {
    /// The string stored in the database (shared with the old JS drivers).
    pub fn as_str(self) -> &'static str {
        match self {
            LoginStatus::PendingSignup => "pendingSignup",
            LoginStatus::PendingPair => "pendingPair",
            LoginStatus::PendingRecovery => "pendingRecovery",
            LoginStatus::LiveRotationKey => "liveRotationKey",
            LoginStatus::LiveSigningKey => "liveSigningKey",
            LoginStatus::Revoked => "revoked",
            LoginStatus::PendingDeletion => "pendingDeletion",
        }
    }

    pub fn parse(s: &str) -> SdkResult<Self> {
        Ok(match s {
            "pendingSignup" => LoginStatus::PendingSignup,
            "pendingPair" => LoginStatus::PendingPair,
            "pendingRecovery" => LoginStatus::PendingRecovery,
            "liveRotationKey" => LoginStatus::LiveRotationKey,
            "liveSigningKey" => LoginStatus::LiveSigningKey,
            "revoked" => LoginStatus::Revoked,
            "pendingDeletion" => LoginStatus::PendingDeletion,
            other => return Err(SdkError::Storage(format!("invalid login status: {other}"))),
        })
    }
}

/// How a login's private key is held.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StoredPrivateKey {
    /// The raw key bytes.
    Inline(Vec<u8>),
    /// Bytes produced by the host's [`crate::sdk::keys::KeyCipher`].
    Sealed(Vec<u8>),
}

/// A login as stored, private key included.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredLogin {
    pub id: LoginId,
    pub status: LoginStatus,
    pub private_key: StoredPrivateKey,
}

/// A login without its private key.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LoginOverview {
    pub id: LoginId,
    pub status: LoginStatus,
}

/// A page of rows plus the cursor to pass for the next page.
pub struct Page<T> {
    pub items: Vec<T>,
    /// `None` once there are no more rows.
    pub next: Option<i64>,
}

/// Rows read per page while hydrating.
pub const HYDRATION_PAGE_SIZE: u32 = 500;

/// Persistent storage. Implementations must be safe to call concurrently.
#[cfg_attr(not(target_arch = "wasm32"), async_trait::async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait::async_trait(?Send))]
pub trait Storage: Send + Sync {
    // ── Events ──────────────────────────────────────────────────────

    /// Insert events, skipping any whose key is already stored. Returns
    /// whether each one was inserted.
    async fn put_events(&self, events: Vec<SignedEvent>) -> SdkResult<Vec<bool>>;

    /// Insert one event this client signed. Fails with
    /// [`SdkError::AlreadyExists`] if its key is taken, so two writers that
    /// picked the same sequence can't silently fork the stream.
    async fn insert_own_event(&self, event: SignedEvent) -> SdkResult<()>;

    async fn get_event(&self, key: EventKey) -> SdkResult<Option<SignedEvent>>;

    /// The highest-sequence event key per (signer, collection) for
    /// `identity`.
    async fn heads(&self, identity: String) -> SdkResult<Vec<EventKey>>;

    /// Events of one stream with a sequence above `after_sequence`.
    async fn stream_events(
        &self,
        identity: String,
        collection: i32,
        signer: PublicKey,
        after_sequence: u64,
    ) -> SdkResult<Vec<SignedEvent>>;

    /// A page of all events, in insertion order. Pass `None` to start.
    async fn events_page(&self, after: Option<i64>, limit: u32) -> SdkResult<Page<SignedEvent>>;

    // ── Content ─────────────────────────────────────────────────────

    /// Insert content, skipping digests already stored. The caller has
    /// already checked each digest against its bytes.
    async fn put_contents(&self, contents: Vec<(ContentDigest, Vec<u8>)>) -> SdkResult<()>;

    async fn get_content(&self, digest: ContentDigest) -> SdkResult<Option<Vec<u8>>>;

    /// A page of all content, in insertion order. Pass `None` to start.
    async fn contents_page(
        &self,
        after: Option<i64>,
        limit: u32,
    ) -> SdkResult<Page<(ContentDigest, Vec<u8>)>>;

    // ── Logins ──────────────────────────────────────────────────────

    /// Fails with [`SdkError::AlreadyExists`] if the login exists.
    async fn put_login(&self, login: StoredLogin) -> SdkResult<()>;

    /// Fails with [`SdkError::NotFound`] if the login doesn't exist.
    async fn set_login_status(&self, id: LoginId, status: LoginStatus) -> SdkResult<()>;

    /// Replace how a login's private key is stored (e.g. sealing an inline
    /// key). Fails with [`SdkError::NotFound`] if the login doesn't exist.
    async fn set_login_key(&self, id: LoginId, private_key: StoredPrivateKey) -> SdkResult<()>;

    async fn list_logins(&self, identity: Option<String>) -> SdkResult<Vec<LoginOverview>>;

    async fn get_login(&self, id: LoginId) -> SdkResult<Option<StoredLogin>>;

    async fn delete_login(&self, id: LoginId) -> SdkResult<()>;

    async fn set_active_login(&self, id: Option<LoginId>) -> SdkResult<()>;

    async fn active_login(&self) -> SdkResult<Option<LoginId>>;

    // ── Blobs ───────────────────────────────────────────────────────

    async fn has_blob(&self, digest: ContentDigest) -> SdkResult<bool>;

    async fn get_blob(&self, digest: ContentDigest) -> SdkResult<Option<Vec<u8>>>;

    async fn put_blob(&self, digest: ContentDigest, bytes: Vec<u8>) -> SdkResult<()>;

    /// Returns whether a blob was deleted.
    async fn delete_blob(&self, digest: ContentDigest) -> SdkResult<bool>;
}

/// The serialized `PublicKey`, the form keys are stored and compared in.
pub(crate) fn public_key_bytes(key: &PublicKey) -> Vec<u8> {
    prost::Message::encode_to_vec(key)
}

/// The key of a stored event, decoded from its event bytes.
pub(crate) fn event_key_of(event: &SignedEvent) -> SdkResult<EventKey> {
    let decoded: polycentric_common::models::protos_v2::Event =
        prost::Message::decode(event.event_bytes.as_slice())?;
    let key = decoded
        .key
        .ok_or_else(|| SdkError::InvalidInput("event has no key".into()))?;
    if key.signed_by.is_none() {
        return Err(SdkError::InvalidInput("event key has no signer".into()));
    }
    Ok(key)
}

#[cfg(test)]
pub(crate) mod tests {
    //! A conformance suite every [`Storage`] implementation runs.

    use super::*;
    use polycentric_common::models::protos_v2::{Event, KeyType};
    use prost::Message;

    fn key(byte: u8) -> PublicKey {
        PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: vec![byte; 32],
        }
    }

    pub fn event(identity: &str, signer: u8, collection: i32, sequence: u64) -> SignedEvent {
        let event = Event {
            key: Some(EventKey {
                collection,
                identity: identity.to_string(),
                signed_by: Some(key(signer)),
                sequence,
            }),
            ..Default::default()
        };
        SignedEvent {
            signature: vec![sequence as u8; 64],
            event_bytes: event.encode_to_vec(),
        }
    }

    fn digest(byte: u8) -> ContentDigest {
        ContentDigest {
            r#type: 1,
            value: vec![byte; 32],
        }
    }

    pub async fn conformance(storage: &dyn Storage) {
        let id = "a".repeat(64);

        // Events: insert, dedupe, strict insert, lookups.
        let inserted = storage
            .put_events(vec![
                event(&id, 1, 2, 1),
                event(&id, 1, 2, 2),
                event(&id, 2, 2, 1),
            ])
            .await
            .unwrap();
        assert_eq!(inserted, vec![true, true, true]);
        let again = storage.put_events(vec![event(&id, 1, 2, 2)]).await.unwrap();
        assert_eq!(again, vec![false]);
        assert!(matches!(
            storage.insert_own_event(event(&id, 1, 2, 2)).await,
            Err(SdkError::AlreadyExists(_))
        ));
        storage.insert_own_event(event(&id, 1, 2, 3)).await.unwrap();

        let k = event_key_of(&event(&id, 1, 2, 3)).unwrap();
        assert!(storage.get_event(k).await.unwrap().is_some());

        let mut heads = storage.heads(id.clone()).await.unwrap();
        heads.sort_by_key(|h| h.signed_by.as_ref().map(|k| k.key.clone()));
        assert_eq!(heads.len(), 2);
        assert_eq!(heads[0].sequence, 3);
        assert_eq!(heads[1].sequence, 1);

        let tail = storage
            .stream_events(id.clone(), 2, key(1), 1)
            .await
            .unwrap();
        assert_eq!(tail.len(), 2);

        let mut all = Vec::new();
        let mut cursor = None;
        loop {
            let page = storage.events_page(cursor, 2).await.unwrap();
            all.extend(page.items);
            match page.next {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        assert_eq!(all.len(), 4);

        // Content.
        storage
            .put_contents(vec![(digest(1), vec![1]), (digest(2), vec![2])])
            .await
            .unwrap();
        storage
            .put_contents(vec![(digest(1), vec![9])])
            .await
            .unwrap();
        assert_eq!(storage.get_content(digest(1)).await.unwrap(), Some(vec![1]));
        assert_eq!(storage.get_content(digest(3)).await.unwrap(), None);
        let page = storage.contents_page(None, 10).await.unwrap();
        assert_eq!(page.items.len(), 2);
        assert!(page.next.is_none());

        // Logins.
        let login = LoginId {
            identity: id.clone(),
            public_key: key(1),
        };
        storage
            .put_login(StoredLogin {
                id: login.clone(),
                status: LoginStatus::PendingSignup,
                private_key: StoredPrivateKey::Inline(vec![7; 32]),
            })
            .await
            .unwrap();
        assert!(matches!(
            storage
                .put_login(StoredLogin {
                    id: login.clone(),
                    status: LoginStatus::PendingSignup,
                    private_key: StoredPrivateKey::Inline(vec![7; 32]),
                })
                .await,
            Err(SdkError::AlreadyExists(_))
        ));
        storage
            .set_login_status(login.clone(), LoginStatus::LiveRotationKey)
            .await
            .unwrap();
        let other = LoginId {
            identity: "b".repeat(64),
            public_key: key(2),
        };
        assert!(matches!(
            storage
                .set_login_status(other.clone(), LoginStatus::Revoked)
                .await,
            Err(SdkError::NotFound(_))
        ));
        storage
            .put_login(StoredLogin {
                id: other.clone(),
                status: LoginStatus::PendingPair,
                private_key: StoredPrivateKey::Sealed(vec![1, 2, 3]),
            })
            .await
            .unwrap();
        assert_eq!(storage.list_logins(None).await.unwrap().len(), 2);
        let mine = storage.list_logins(Some(id.clone())).await.unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(mine[0].status, LoginStatus::LiveRotationKey);
        let stored = storage.get_login(other.clone()).await.unwrap().unwrap();
        assert_eq!(stored.private_key, StoredPrivateKey::Sealed(vec![1, 2, 3]));
        storage
            .set_login_key(other.clone(), StoredPrivateKey::Sealed(vec![4, 5, 6]))
            .await
            .unwrap();
        let resealed = storage.get_login(other.clone()).await.unwrap().unwrap();
        assert_eq!(
            resealed.private_key,
            StoredPrivateKey::Sealed(vec![4, 5, 6])
        );
        assert_eq!(resealed.status, stored.status);

        assert_eq!(storage.active_login().await.unwrap(), None);
        storage.set_active_login(Some(login.clone())).await.unwrap();
        assert_eq!(storage.active_login().await.unwrap(), Some(login.clone()));
        storage.set_active_login(None).await.unwrap();
        assert_eq!(storage.active_login().await.unwrap(), None);

        storage.delete_login(other.clone()).await.unwrap();
        assert!(storage.get_login(other).await.unwrap().is_none());

        // Blobs.
        assert!(!storage.has_blob(digest(5)).await.unwrap());
        storage.put_blob(digest(5), vec![5; 10]).await.unwrap();
        assert!(storage.has_blob(digest(5)).await.unwrap());
        assert_eq!(
            storage.get_blob(digest(5)).await.unwrap(),
            Some(vec![5; 10])
        );
        assert!(storage.delete_blob(digest(5)).await.unwrap());
        assert!(!storage.delete_blob(digest(5)).await.unwrap());
    }
}
