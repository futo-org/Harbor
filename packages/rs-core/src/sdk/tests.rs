//! End-to-end tests of [`Client`] against local storage and a mock server.

use std::sync::{Arc, Mutex};

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{Content, Post, content::ContentBody};

use crate::sdk::client::{Client, ClientConfig};
use crate::sdk::error::SdkError;
use crate::sdk::events::ClientEvent;
use crate::sdk::keys::KeyCipher;
use crate::sdk::storage::sqlite::SqliteStorage;
use crate::sdk::storage::{LoginStatus, Storage};
use crate::sdk::test_server::MockServer;
use crate::sdk::types::{ClientState, KeyPower, LoginKind, SyncStrategy};

/// A server URL nothing listens on.
const DEAD_SERVER: &str = "http://127.0.0.1:9";

fn post(text: &str) -> Vec<u8> {
    prost::Message::encode_to_vec(&Content {
        content_body: Some(ContentBody::Post(Post {
            text: text.to_string(),
            ..Default::default()
        })),
    })
}

fn post_text(bundle: &polycentric_common::models::protos_v2::EventBundle) -> String {
    use prost::Message;
    let bytes = &bundle.serialized_content.as_ref().unwrap().content_bytes;
    match Content::decode(bytes.as_slice()).unwrap().content_body {
        Some(ContentBody::Post(p)) => p.text,
        other => panic!("not a post: {other:?}"),
    }
}

fn cipher() -> Arc<dyn KeyCipher> {
    Arc::new(crate::sdk::keys::AeadKeyCipher::new(&[3; 32]).unwrap())
}

async fn open(storage: Arc<dyn Storage>, servers: &[&str]) -> Client {
    Client::open(ClientConfig {
        storage,
        key_cipher: Some(cipher()),
        seed_servers: servers.iter().map(|s| s.to_string()).collect(),
        application: None,
        persistent: true,
    })
    .await
    .unwrap()
}

fn memory() -> Arc<dyn Storage> {
    Arc::new(SqliteStorage::open_in_memory().unwrap())
}

#[tokio::test]
async fn creates_an_identity_and_publishes_offline() {
    let client = open(memory(), &[DEAD_SERVER]).await;
    assert_eq!(client.state(), ClientState::Ready);
    assert!(client.active_identity().is_none());

    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    client.add_listener(Arc::new(move |e| sink.lock().unwrap().push(e.clone())));

    let login = client.create_identity(None).await.unwrap();
    assert_eq!(client.active_identity(), Some(login.identity.clone()));

    let state = client.resolve_identity(None).unwrap();
    assert_eq!(state.rotation_keys, vec![login.public_key.clone()]);
    assert_eq!(state.servers, Some(vec![DEAD_SERVER.to_string()]));

    let signed = client
        .publish(&post("hello"), collections::FEED)
        .await
        .unwrap();
    let posts = client
        .list_valid_events(&login.identity, collections::FEED)
        .unwrap();
    assert_eq!(posts.len(), 1);
    assert_eq!(posts[0].signed_event.as_ref(), Some(&signed));

    let events = events.lock().unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e, ClientEvent::LoginChanged(Some(_))))
    );
    assert!(
        events
            .iter()
            .filter(|e| matches!(e, ClientEvent::Committed { .. }))
            .count()
            >= 2
    );
    // The push to the dead server failed but was reported, not thrown.
    assert!(events.iter().any(|e| matches!(
        e,
        ClientEvent::PushResults(r) if r.iter().any(|r| r.error.is_some())
    )));
}

#[tokio::test]
async fn restores_login_and_events_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite");
    let blobs = dir.path().join("blobs");

    let identity = {
        let storage = Arc::new(SqliteStorage::open(&path, Some(blobs.clone())).unwrap());
        let client = open(storage, &[DEAD_SERVER]).await;
        let login = client.create_identity(None).await.unwrap();
        client
            .publish(&post("one"), collections::FEED)
            .await
            .unwrap();
        let blob = client
            .commit_blob(vec![1, 2, 3], "image/jpeg")
            .await
            .unwrap();
        assert!(client.has_blob(blob.digest.unwrap()).await.unwrap());
        login.identity
    };

    let storage = Arc::new(SqliteStorage::open(&path, Some(blobs)).unwrap());
    let client = open(storage, &[]).await;
    assert_eq!(client.active_identity(), Some(identity.clone()));
    // The identity's own server list was adopted over the (empty) seeds.
    assert_eq!(client.servers(), vec![DEAD_SERVER.to_string()]);

    client
        .publish(&post("two"), collections::FEED)
        .await
        .unwrap();
    let posts = client
        .list_valid_events(&identity, collections::FEED)
        .unwrap();
    let mut texts: Vec<String> = posts.iter().map(post_text).collect();
    texts.sort();
    assert_eq!(texts, vec!["one", "two"]);
}

#[tokio::test]
async fn clients_sharing_storage_do_not_fork_sequences() {
    let storage = memory();
    let a = open(storage.clone(), &[DEAD_SERVER]).await;
    let login = a.create_identity(None).await.unwrap();

    // A second client on the same storage, like another browser tab.
    let b = open(storage.clone(), &[DEAD_SERVER]).await;
    assert_eq!(b.active_identity(), Some(login.identity.clone()));

    a.publish(&post("from a"), collections::FEED).await.unwrap();
    // `b` hasn't seen a's post; it must not reuse its sequence.
    b.publish(&post("from b"), collections::FEED).await.unwrap();
    a.publish(&post("from a again"), collections::FEED)
        .await
        .unwrap();

    let heads = storage.heads(login.identity.clone()).await.unwrap();
    let feed = heads
        .iter()
        .find(|h| h.collection == collections::FEED)
        .unwrap();
    assert_eq!(feed.sequence, 3);
}

#[tokio::test]
async fn stale_commits_are_rejected_instead_of_forking() {
    let storage = memory();
    let a = open(storage.clone(), &[DEAD_SERVER]).await;
    a.create_identity(None).await.unwrap();
    let b = open(storage.clone(), &[DEAD_SERVER]).await;

    // Both build sequence 1 before either commits.
    let content = post("race");
    let ea = a
        .build_event(&content, collections::FEED, None, None)
        .await
        .unwrap();
    let eb = b
        .build_event(&post("race 2"), collections::FEED, None, None)
        .await
        .unwrap();
    let sa = a.sign_event(&ea, None).unwrap();
    let sb = b.sign_event(&eb, None).unwrap();
    a.commit_event(sa, Some(content)).await.unwrap();
    assert!(matches!(
        b.commit_event(sb, Some(post("race 2"))).await,
        Err(SdkError::AlreadyExists(_))
    ));
}

#[tokio::test]
async fn syncs_through_a_server_and_pairs_a_second_device() {
    let (server, url) = MockServer::start().await;

    let a = open(memory(), &[&url]).await;
    let login = a.create_identity(None).await.unwrap();
    a.publish(&post("first"), collections::FEED).await.unwrap();
    a.sync(SyncStrategy::Full).await.unwrap();
    assert_eq!(server.event_count(&login.identity), 2);

    // A second device asks to join; the first authorizes its key.
    let b = open(memory(), &[&url]).await;
    let pending = b
        .begin_login(&login.identity, LoginKind::Pair)
        .await
        .unwrap();
    assert_eq!(pending.status, LoginStatus::PendingPair);
    a.add_rotation_key(pending.key_pair.public_key())
        .await
        .unwrap();
    assert_eq!(server.event_count(&login.identity), 3);

    let state = b.claim(pending.clone(), None).await.unwrap();
    assert_eq!(
        state.power_of(&pending.key_pair.public_key()),
        Some(KeyPower::Rotation)
    );
    assert_eq!(b.active_identity(), Some(login.identity.clone()));
    let stored = b
        .get_login_details(pending.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.status, LoginStatus::LiveRotationKey);

    // b pulls a's post and posts its own; a pulls that back.
    b.sync(SyncStrategy::Full).await.unwrap();
    let posts = b
        .list_valid_events(&login.identity, collections::FEED)
        .unwrap();
    assert_eq!(
        posts.iter().map(post_text).collect::<Vec<_>>(),
        vec!["first"]
    );

    b.publish(&post("second"), collections::FEED).await.unwrap();
    b.sync(SyncStrategy::PartialPush).await.unwrap();
    let pulled = a.sync(SyncStrategy::PartialPull).await.unwrap();
    assert!(pulled >= 1);
    let mut texts: Vec<String> = a
        .list_valid_events(&login.identity, collections::FEED)
        .unwrap()
        .iter()
        .map(post_text)
        .collect();
    texts.sort();
    assert_eq!(texts, vec!["first", "second"]);
}

#[tokio::test]
async fn manages_servers_and_recovery_keys() {
    let (_server, url) = MockServer::start().await;
    let (_other, other_url) = MockServer::start().await;

    let client = open(memory(), &[&url]).await;
    client.create_identity(None).await.unwrap();

    client.add_server(other_url.clone()).await.unwrap();
    assert_eq!(client.servers(), vec![url.clone(), other_url.clone()]);
    assert!(matches!(
        client.add_server(other_url.clone()).await,
        Err(SdkError::ServerAlreadyAdded)
    ));
    client.remove_server(url.clone()).await.unwrap();
    assert_eq!(client.servers(), vec![other_url.clone()]);

    let recovery = client.rotate_recovery_key().await.unwrap();
    assert!(client.check_recovery_key(&recovery, None));
    let wrong = crate::sdk::keys::KeyPair::generate().unwrap().private_key();
    assert!(!client.check_recovery_key(&wrong, None));
}

#[tokio::test]
async fn backs_up_and_recovers_an_identity() {
    use crate::sdk::backup::{BackupCheck, backup_info};

    let (_server, url) = MockServer::start().await;
    let a = open(memory(), &[&url]).await;
    let login = a.create_identity(None).await.unwrap();
    let first = a.create_backup().await.unwrap();
    assert_eq!(a.check_backup(&first, None), BackupCheck::Valid);

    let info = backup_info(&first).unwrap();
    assert_eq!(info.identity_key, login.identity);
    assert_eq!(info.sequence, 2);

    // A new backup rotates the recovery key out from under the first.
    let second = a.create_backup().await.unwrap();
    assert_eq!(a.check_backup(&second, None), BackupCheck::Valid);
    assert_eq!(a.check_backup(&first, None), BackupCheck::Stale);
    assert_eq!(a.check_backup("not a backup", None), BackupCheck::Invalid);
    let other = open(memory(), &[DEAD_SERVER]).await;
    let other_login = other.create_identity(None).await.unwrap();
    assert_eq!(
        a.check_backup(&second, Some(&other_login.identity)),
        BackupCheck::OtherIdentity
    );
    a.sync(SyncStrategy::Full).await.unwrap();

    // A fresh device with only the backup.
    let b = open(memory(), &[&url]).await;
    assert!(b.recover_from_backup(&first).await.is_err());
    assert!(b.list_logins(None).await.unwrap().is_empty());
    let recovered = b.recover_from_backup(&second).await.unwrap();
    assert_eq!(b.active_identity(), Some(login.identity.clone()));
    let state = b.resolve_identity(None).unwrap();
    assert_eq!(
        state.power_of(&recovered.public_key),
        Some(KeyPower::Rotation)
    );
}

#[tokio::test]
async fn persistent_storage_needs_a_key_cipher() {
    let result = Client::open(ClientConfig {
        storage: memory(),
        key_cipher: None,
        seed_servers: vec![],
        application: None,
        persistent: true,
    })
    .await;
    assert!(matches!(result, Err(SdkError::InvalidInput(_))));
}

#[tokio::test]
async fn seals_inline_keys_from_older_stores() {
    use crate::sdk::keys::KeyPair;
    use crate::sdk::storage::{LoginId, StoredLogin, StoredPrivateKey};

    // An older store kept this login's key inline.
    let storage = memory();
    let key_pair = KeyPair::generate().unwrap();
    let id = LoginId {
        identity: "b".repeat(64),
        public_key: key_pair.public_key(),
    };
    storage
        .put_login(StoredLogin {
            id: id.clone(),
            status: LoginStatus::LiveRotationKey,
            private_key: StoredPrivateKey::Inline(key_pair.seed().to_vec()),
        })
        .await
        .unwrap();
    storage.set_active_login(Some(id.clone())).await.unwrap();

    let client = open(storage.clone(), &[DEAD_SERVER]).await;
    let stored = storage.get_login(id.clone()).await.unwrap().unwrap();
    assert!(matches!(stored.private_key, StoredPrivateKey::Sealed(_)));
    assert_eq!(
        client.active_login().unwrap().key_pair.seed(),
        key_pair.seed()
    );
}

struct Xor;

#[async_trait::async_trait]
impl KeyCipher for Xor {
    async fn seal(&self, key: Vec<u8>) -> Result<Vec<u8>, SdkError> {
        Ok(key.iter().map(|b| b ^ 0x5a).collect())
    }
    async fn open(&self, sealed: Vec<u8>) -> Result<Vec<u8>, SdkError> {
        self.seal(sealed).await
    }
}

#[tokio::test]
async fn seals_private_keys_with_a_host_cipher() {
    let storage = memory();
    let config = || ClientConfig {
        storage: storage.clone(),
        key_cipher: Some(Arc::new(Xor)),
        seed_servers: vec![DEAD_SERVER.to_string()],
        application: None,
        persistent: true,
    };
    let client = Client::open(config()).await.unwrap();
    let login = client.create_identity(None).await.unwrap();
    let seed = client.active_login().unwrap().key_pair.seed();

    let stored = storage.get_login(login.clone()).await.unwrap().unwrap();
    match stored.private_key {
        crate::sdk::storage::StoredPrivateKey::Sealed(bytes) => assert_ne!(bytes, seed.to_vec()),
        other => panic!("expected a sealed key, got {other:?}"),
    }

    let reopened = Client::open(config()).await.unwrap();
    assert_eq!(reopened.active_login().unwrap().key_pair.seed(), seed);
}

#[tokio::test]
async fn signing_out_and_deleting_logins() {
    let client = open(memory(), &[DEAD_SERVER]).await;
    let login = client.create_identity(None).await.unwrap();

    client.login_as(None, true).await.unwrap();
    assert!(client.active_identity().is_none());
    assert_eq!(client.stored_active_login().await.unwrap(), None);
    assert!(matches!(
        client.publish(&post("nope"), collections::FEED).await,
        Err(SdkError::NoActiveIdentity)
    ));

    client.login_as(Some(login.clone()), true).await.unwrap();
    assert_eq!(
        client.stored_active_login().await.unwrap(),
        Some(login.clone())
    );

    client.delete_login(login.clone()).await.unwrap();
    assert!(client.active_identity().is_none());
    assert!(client.list_logins(None).await.unwrap().is_empty());
}

#[tokio::test]
async fn mints_server_jwts_for_the_active_login() {
    let client = open(memory(), &[DEAD_SERVER]).await;
    assert!(matches!(
        client.mint_server_jwt("https://a.example"),
        Err(SdkError::NoActiveIdentity)
    ));
    let login = client.create_identity(None).await.unwrap();
    let token = client.mint_server_jwt("https://a.example").unwrap();
    let verified = polycentric_common::jwt::verify_jwt(&token).unwrap();
    assert_eq!(verified.claims.iss, login.identity);
    assert_eq!(verified.signed_by, login.public_key.key);
}

/// Content with a protobuf map: its encoding depends on iteration order,
/// so the client must hash and store the caller's bytes, never re-encode.
#[tokio::test]
async fn commits_content_with_maps_as_given() {
    use polycentric_common::models::protos_v2::VerificationClaim;

    let client = open(memory(), &[DEAD_SERVER]).await;
    let login = client.create_identity(None).await.unwrap();
    let fields = (0..16)
        .map(|i| (format!("field{i}"), vec![i as u8; 4]))
        .collect();
    let content = prost::Message::encode_to_vec(&Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            fields,
            ..Default::default()
        })),
    });

    client.save_content(&content).await.unwrap();
    let event = client
        .build_event(&content, collections::VERIFICATIONS, None, None)
        .await
        .unwrap();
    let signed = client.sign_event(&event, None).unwrap();
    client.commit_event(signed, Some(content)).await.unwrap();
    assert_eq!(
        client
            .list_valid_events(&login.identity, collections::VERIFICATIONS)
            .unwrap()
            .len(),
        1
    );
}
