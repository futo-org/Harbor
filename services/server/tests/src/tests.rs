use ed25519_dalek::SigningKey;
use integration_tests::{
    COLLECTION_FEED, COLLECTION_VERIFICATIONS, DEFAULT_CREATED_AT, HOUR,
    bundle_signature, connect_event_sync, generate_signing_key, leaf_hash,
    make_identity_bundle, make_post_bundle, make_revocation_bound,
    make_verification_claim_bundle, node_hash, public_key_of, random_string,
    repeated_string, search_service, *,
};
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::event_sync_service_client::EventSyncServiceClient;
use polycentric_common::models::protos_v2::*;
use polycentric_common::models::protos_v2::{SearchPostsRequest, SortUsersBy};
use prost::Message as ProstMessage;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

mod event_sync;
mod feeds;
mod graph;
mod search;

// Following are moderation / label integration tests: The server must
// be started with `POLYCENTRIC_MODERATION_IDENTITY` set to the value
// returned by `test_moderator_identity()`.

/// Ensures the moderator's genesis identity event is published exactly once
/// across all tests (the moderator identity is deterministic, so sequence
/// collisions would silently fail on the second insert).
static MODERATOR_READY: AtomicBool = AtomicBool::new(false);

async fn ensure_moderator_setup() {
    if MODERATOR_READY.load(Ordering::Acquire) {
        return;
    }
    if MODERATOR_READY
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
    {
        let mut event = connect_event_sync().await;
        let mod_key = test_moderator_key();
        let mod_identity = test_moderator_identity();
        publish_genesis(
            &mut event,
            &mod_identity,
            &mod_key,
            DEFAULT_CREATED_AT,
        )
        .await;
    }
}

/// Monotonic sequence number for the moderator's Labels events — each test
/// needs a unique (collection, identity, pub_key, sequence) tuple or the
/// duplicate is silently dropped by the server. Seeded from the clock because
/// test runners like nextest run each test in its own process, so a fixed
/// initial value would collide across concurrently running tests.
static NEXT_LABELS_SEQ: OnceLock<AtomicU64> = OnceLock::new();

async fn next_labels_seq() -> u64 {
    NEXT_LABELS_SEQ
        .get_or_init(|| {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock before unix epoch")
                .as_nanos() as u64;
            AtomicU64::new(nanos)
        })
        .fetch_add(1, Ordering::Relaxed)
}

async fn publish_genesis(
    client: &mut EventSyncServiceClient<tonic::transport::Channel>,
    identity: &str,
    key: &SigningKey,
    created_at: u64,
) -> Vec<u8> {
    let initial = Identity {
        rotation_keys: vec![public_key_of(key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let bundle =
        make_identity_bundle(identity, key, 1, 1, vec![1], initial, created_at);
    let sig = bundle_signature(&bundle);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("genesis put failed");
    sig
}

async fn publish_post(
    client: &mut EventSyncServiceClient<tonic::transport::Channel>,
    identity: &str,
    key: &SigningKey,
    text: &str,
    attributed_urls: &[&str],
    created_at: u64,
) -> Vec<u8> {
    let bundle = make_post_bundle(
        identity,
        key,
        1,
        1,
        vec![1],
        vec![],
        text,
        attributed_urls,
        created_at,
    );
    let sig = bundle_signature(&bundle);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("post put failed");
    sig
}

async fn publish_labels(
    client: &mut EventSyncServiceClient<tonic::transport::Channel>,
    identity: &str,
    key: &SigningKey,
    target_event_key: EventKey,
    label_values: Vec<String>,
    created_at: u64,
) -> Vec<u8> {
    let seq = next_labels_seq().await;
    let bundle = make_labels_bundle(
        identity,
        key,
        seq,
        1,
        vec![1],
        vec![],
        target_event_key,
        label_values,
        created_at,
    );
    let sig = bundle_signature(&bundle);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("labels put failed");
    sig
}

fn get_post_event_key(identity: &str, key: &SigningKey) -> EventKey {
    EventKey {
        collection: COLLECTION_FEED,
        identity: identity.to_string(),
        signed_by: Some(public_key_of(key)),
        sequence: 1,
    }
}

/// Returns the labels bundle content if it decodes to Labels, panics otherwise.
fn assert_is_labels_bundle(
    bundle: &EventBundle,
    expected_target: &EventKey,
    expected_values: &[&str],
) {
    let sc = bundle
        .serialized_content
        .as_ref()
        .expect("bundle has serialized_content");
    let content = Content::decode(sc.content_bytes.as_slice())
        .expect("valid content protobuf");
    match &content.content_body {
        Some(content::ContentBody::Labels(labels)) => {
            let ek = labels.event_key.as_ref().expect("Labels has event_key");
            assert_eq!(ek.collection, expected_target.collection);
            assert_eq!(ek.identity, expected_target.identity);
            assert_eq!(ek.sequence, expected_target.sequence);
            let actual: Vec<&str> =
                labels.label_values.iter().map(|s| s.as_str()).collect();
            assert_eq!(actual, expected_values, "label_values mismatch");
        }
        _ => panic!(
            "expected Labels content body, got {:?}",
            content.content_body
        ),
    }
}
