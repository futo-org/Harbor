//! [`HarborClient`] as hosts use it: records in, records out.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use polycentric_common::models::collections;

use crate::records::{
    Content, ContentBody, ContentDigestType, KeyType, PairingInfo, Post, PublicKey,
    VerificationClaim,
};
use crate::sdk::ffi::{
    ClientEvent, ClientListener, HarborClient, HarborClientBuilder, HarborClientConfig,
    StorageConfig, decode_pairing_code, encode_pairing_code, event_key_id, parse_event_key_id,
};
use crate::sdk::types::ClientState;

const DEAD_SERVER: &str = "http://127.0.0.1:9";

async fn open() -> Arc<HarborClient> {
    HarborClientBuilder::new(HarborClientConfig {
        storage: StorageConfig::Memory,
        seed_servers: vec![DEAD_SERVER.into()],
        application: None,
    })
    .open()
    .await
    .unwrap()
}

fn post(text: &str) -> Content {
    Content {
        content_body: Some(ContentBody::Post {
            post: Post {
                text: text.into(),
                ..Default::default()
            },
        }),
    }
}

#[derive(Default)]
struct Recorder(Mutex<Vec<ClientEvent>>);

impl ClientListener for Recorder {
    fn on_event(&self, event: ClientEvent) {
        self.0.lock().unwrap().push(event);
    }
}

#[tokio::test]
async fn publishes_records_and_reads_them_back() {
    let client = open().await;
    let recorder = Arc::new(Recorder::default());
    client.add_listener(recorder.clone());
    assert_eq!(client.snapshot().state, ClientState::Ready);
    assert!(client.snapshot().login.is_none());

    let login = client.create_identity(None).await.unwrap();
    let snapshot = client.snapshot();
    assert_eq!(snapshot.login.unwrap().id, login);
    assert_eq!(snapshot.servers, vec![DEAD_SERVER.to_string()]);

    let bundle = client
        .publish(post("hello"), collections::FEED)
        .await
        .unwrap();
    let event = bundle.signed_event.unwrap().event.unwrap();
    let key = event.key.unwrap();
    assert_eq!(key.identity, login.identity);
    assert_eq!(key.collection, collections::FEED);
    assert_eq!(
        event.content_digest.unwrap().r#type,
        ContentDigestType::Sha256
    );
    assert_eq!(
        bundle.serialized_content.unwrap().content,
        Some(post("hello"))
    );

    let posts = client
        .list_valid_events(login.identity.clone(), collections::FEED)
        .unwrap();
    assert_eq!(posts.len(), 1);
    assert_eq!(
        posts[0].serialized_content.as_ref().unwrap().content,
        Some(post("hello"))
    );

    let events = recorder.0.lock().unwrap();
    assert!(events.iter().any(|e| matches!(
        e,
        ClientEvent::Snapshot { snapshot } if snapshot.login.is_some()
    )));
    assert!(events.iter().any(|e| matches!(
        e,
        ClientEvent::Committed { bundle } if bundle.serialized_content.as_ref().and_then(|c| c.content.clone()) == Some(post("hello"))
    )));
}

#[tokio::test]
async fn prepared_events_stay_fixed_until_committed() {
    let client = open().await;
    let login = client.create_identity(None).await.unwrap();

    let pending = client
        .prepare_event(post("draft"), collections::FEED)
        .await
        .unwrap();
    assert_eq!(pending.key().identity, login.identity);
    // Nothing is stored yet.
    assert!(
        client
            .list_valid_events(login.identity.clone(), collections::FEED)
            .unwrap()
            .is_empty()
    );

    let committed = client.commit_event(pending.clone()).await.unwrap();
    assert_eq!(committed, pending.bundle());
    assert_eq!(
        client
            .list_valid_events(login.identity.clone(), collections::FEED)
            .unwrap()
            .len(),
        1
    );
    // The same event can't be stored twice.
    assert!(client.commit_event(pending).await.is_err());
}

/// Content with a map round-trips: rs-core encodes it once and keeps those
/// bytes, so the digest always matches.
#[tokio::test]
async fn content_with_maps_commits() {
    let client = open().await;
    let login = client.create_identity(None).await.unwrap();
    let fields: HashMap<String, Vec<u8>> = (0..16)
        .map(|i| (format!("field{i}"), vec![i as u8; 4]))
        .collect();
    let claim = Content {
        content_body: Some(ContentBody::VerificationClaim {
            verification_claim: VerificationClaim {
                schema: None,
                fields: fields.clone(),
            },
        }),
    };
    client
        .publish(claim.clone(), collections::VERIFICATIONS)
        .await
        .unwrap();
    let stored = client
        .list_valid_events(login.identity, collections::VERIFICATIONS)
        .unwrap();
    assert_eq!(
        stored[0].serialized_content.as_ref().unwrap().content,
        Some(claim)
    );
}

#[tokio::test]
async fn event_key_ids_round_trip() {
    let client = open().await;
    client.create_identity(None).await.unwrap();
    let bundle = client.publish(post("x"), collections::FEED).await.unwrap();
    let key = bundle.signed_event.unwrap().event.unwrap().key.unwrap();
    let id = event_key_id(key.clone());
    assert_eq!(parse_event_key_id(id), Some(key));
    assert_eq!(parse_event_key_id("zz".into()), None);
    assert_eq!(parse_event_key_id(String::new()), None);
}

#[test]
fn pairing_codes_round_trip_in_every_encoding() {
    use base64::Engine;
    use prost::Message;

    let info = PairingInfo {
        server: "https://srv.example".into(),
        digest_sha256: vec![7; 32],
    };
    let code = encode_pairing_code(info.clone());
    assert!(!code.contains('=') && !code.contains('+') && !code.contains('/'));
    assert_eq!(decode_pairing_code(code), Some(info.clone()));

    // Older apps shared hex and padded standard base64.
    let bytes =
        polycentric_common::models::protos_v2::PairingInfo::from(info.clone()).encode_to_vec();
    assert_eq!(decode_pairing_code(hex::encode(&bytes)), Some(info.clone()));
    assert_eq!(
        decode_pairing_code(base64::engine::general_purpose::STANDARD.encode(&bytes)),
        Some(info)
    );
    assert_eq!(decode_pairing_code("nonsense".into()), None);
}

#[tokio::test]
async fn persistent_storage_needs_a_cipher_across_the_ffi() {
    let dir = tempfile::tempdir().unwrap();
    let config = || HarborClientConfig {
        storage: StorageConfig::Sqlite {
            path: dir.path().join("db.sqlite").to_string_lossy().into(),
            blob_directory: None,
        },
        seed_servers: vec![],
        application: None,
    };
    assert!(HarborClientBuilder::new(config()).open().await.is_err());

    let builder = HarborClientBuilder::new(config());
    builder.key_cipher(crate::sdk::keys::aead_key_cipher(vec![1; 32]).unwrap());
    let client = builder.open().await.unwrap();
    let login = client.create_identity(None).await.unwrap();
    drop(client);

    // Reopening needs the same wrapping key to sign in again.
    let builder = HarborClientBuilder::new(config());
    builder.key_cipher(crate::sdk::keys::aead_key_cipher(vec![1; 32]).unwrap());
    let client = builder.open().await.unwrap();
    assert_eq!(client.snapshot().login.map(|l| l.id), Some(login));

    let builder = HarborClientBuilder::new(config());
    builder.key_cipher(crate::sdk::keys::aead_key_cipher(vec![2; 32]).unwrap());
    let client = builder.open().await.unwrap();
    assert!(client.snapshot().login.is_none());
}

#[tokio::test]
async fn identity_mutations_return_event_keys() {
    let client = open().await;
    let login = client.create_identity(None).await.unwrap();
    let key = PublicKey {
        key_type: KeyType::Ed25519,
        key: crate::sdk::keys::KeyPair::generate()
            .unwrap()
            .public_key()
            .key,
    };
    let event_key = client.add_signing_key(key.clone()).await.unwrap();
    assert_eq!(event_key.identity, login.identity);
    assert_eq!(event_key.collection, collections::IDENTITY);
    let state = client.resolve_identity(None).unwrap();
    assert!(state.signing_keys.contains(&key));
}

#[tokio::test]
async fn seeded_identities_are_reproducible() {
    use crate::sdk::ffi::identity_key_for_seed;
    let client = open().await;
    let expected = identity_key_for_seed(vec![9; 32], vec![DEAD_SERVER.into()]).unwrap();
    let login = client
        .create_identity_from_seed(vec![9; 32], None)
        .await
        .unwrap();
    assert_eq!(login.identity, expected);
    let again = open().await;
    let login = again
        .create_identity_from_seed(vec![9; 32], None)
        .await
        .unwrap();
    assert_eq!(login.identity, expected);
    assert!(identity_key_for_seed(vec![9; 31], vec![]).is_err());
}
