use ed25519_dalek::SigningKey;
use integration_tests::{
    COLLECTION_FEED, COLLECTION_VERIFICATIONS, DEFAULT_CREATED_AT, HOUR,
    bundle_signature, connect_event_sync, generate_signing_key, graph_service,
    leaf_hash, make_identity_bundle, make_post_bundle, make_revocation_bound,
    make_verification_claim_bundle, node_hash, public_key_of, random_string,
    repeated_string, search_service, *,
};
use polycentric_common::models::protos_v2::content::ContentBody;
use polycentric_common::models::protos_v2::event_sync_service_client::EventSyncServiceClient;
use polycentric_common::models::protos_v2::graph_service_client::GraphServiceClient;
use polycentric_common::models::protos_v2::*;
use polycentric_common::models::protos_v2::{SearchPostsRequest, SortUsersBy};
use prost::Message as ProstMessage;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

#[tokio::test]
async fn list_events_empty_works() {
    let mut client = connect_event_sync().await;
    client
        .list_events(ListEventsRequest {
            size: Some(10),
            ..Default::default()
        })
        .await
        .expect("list_events failed");
    // No assertion on count — server may have prior state — just that the
    // call succeeds and decodes.
}

#[tokio::test]
async fn put_then_list_round_trip() {
    let mut client = TestClient::new().await;

    let post_signature = client.post_text("hello", DEFAULT_CREATED_AT + HOUR);

    client.submit_events().await;

    let identity = client.identity().to_owned();
    let response = client
        .event_sync_client()
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");

    let bundles = response.into_inner().event_bundles;
    assert!(
        bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_signature)
            .unwrap_or(false)),
        "expected our post in the list response",
    );
}

#[tokio::test]
async fn invalid_signature_rejected() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();
    let initial = Identity {
        rotation_keys: vec![public_key_of(&key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    };
    let identity = initial.derive_hex_key();

    let mut bundle = make_post_bundle(
        &identity,
        &key,
        1,
        1,
        vec![1],
        vec![],
        "tampered",
        DEFAULT_CREATED_AT,
    );
    if let Some(ref mut signed) = bundle.signed_event {
        signed.signature[0] ^= 0xFF;
    }

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("put_events failed");
    let inner = response.into_inner();
    assert!(
        inner
            .errors
            .iter()
            .any(|e| e.message.contains("invalid signature")),
        "tampered signature must be rejected, got errors: {:?}",
        inner.errors,
    );
}

/// A revokes B after B has written two FEED events. The pre-revocation
/// event below the head must still appear in `list_events` AND carry a
/// valid `EventProof` whose audit path verifies against the head's
/// `previous_root`.
#[tokio::test]
async fn revoked_key_pre_revocation_events_remain_valid() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();
    let signing_key = generate_signing_key();

    // Genesis content: rotation=[A], signing=[B].
    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![public_key_of(&signing_key)],
        revocation_bounds: vec![],
        servers: None,
    };
    let identity = initial.derive_hex_key();

    // Genesis identity event signed by A. Dedup keys = [A, B]; VC = [1, 0].
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        DEFAULT_CREATED_AT,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis],
        })
        .await
        .expect("genesis put failed");

    // B writes FEED event 1: previous_root is empty (no prior events).
    // VC for FEED: [A_max=0, B_max=1].
    let post_1 = make_post_bundle(
        &identity,
        &signing_key,
        1,
        1,
        vec![0, 1],
        vec![],
        "first post",
        DEFAULT_CREATED_AT + HOUR,
    );
    let sig_1 = bundle_signature(&post_1);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_1],
        })
        .await
        .expect("post_1 put failed");

    // B writes FEED event 2: previous_root commits to a one-leaf tree of sig_1.
    // VC for FEED: [A_max=0, B_max=2].
    let root_after_1 = leaf_hash(&sig_1);
    let post_2 = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        root_after_1.clone(),
        "second post",
        DEFAULT_CREATED_AT + 2 * HOUR,
    );
    let sig_2 = bundle_signature(&post_2);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_2],
        })
        .await
        .expect("post_2 put failed");

    // A rotates and revokes B. Target pins post_2 as head; its tree has
    // one leaf (post_1), so root = leaf_hash(sig_1) and leaf_count = 1.
    let revoked_content = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![make_revocation_bound(
            &signing_key,
            COLLECTION_FEED,
            sig_2.clone(),
            root_after_1.clone(),
            1,
        )],
        servers: None,
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked_content,
        DEFAULT_CREATED_AT + 3 * HOUR,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![rotation],
        })
        .await
        .expect("rotation put failed");

    // List events for the identity.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;

    // Both of B's events should still be visible.
    let bundle_1 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_1)
                .unwrap_or(false)
        })
        .expect("post_1 missing from list_events response");
    let bundle_2 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_2)
                .unwrap_or(false)
        })
        .expect("post_2 missing from list_events response");

    // post_2 IS the head — server should attach no proof.
    assert!(
        bundle_2.event_proofs.is_empty(),
        "head event should carry no EventProof (it equals the target)",
    );

    // post_1 is a non-head pre-revocation event — server should attach
    // exactly one proof against post_2.
    assert_eq!(
        bundle_1.event_proofs.len(),
        1,
        "expected exactly one EventProof attached to post_1, got {}",
        bundle_1.event_proofs.len(),
    );
    let proof = &bundle_1.event_proofs[0];
    assert_eq!(
        proof.target_signature, sig_2,
        "proof's target must be the head event"
    );
    assert_eq!(proof.leaf_index, 0, "post_1 is at leaf index 0");
    assert!(
        proof.audit_path.is_empty(),
        "a single-leaf tree has an empty audit path; got {} hashes",
        proof.audit_path.len(),
    );

    // Cryptographically verify the proof against the head's recorded root.
    // For a one-leaf tree the root IS the leaf hash, so the verification
    // reduces to checking leaf_hash(sig_1) == root_after_1.
    assert_eq!(
        leaf_hash(&sig_1),
        root_after_1,
        "recomputed root should match the bound's recorded root",
    );
}

/// After A revokes B, B writes a third post (post-revocation). The server
/// still stores it (signatures verify), but `attach_proofs` can't build a
/// valid proof — post_3 is not a leaf of the head's tree — so the bundle
/// comes back with no `event_proofs`, which a downstream validator treats
/// as a post-revocation forgery.
#[tokio::test]
async fn post_revocation_event_returns_without_proof() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();
    let signing_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![public_key_of(&signing_key)],
        revocation_bounds: vec![],
        servers: None,
    };
    let identity = initial.derive_hex_key();

    // Genesis.
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        DEFAULT_CREATED_AT,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis],
        })
        .await
        .expect("genesis put failed");

    // B writes post_1, then post_2.
    let post_1 = make_post_bundle(
        &identity,
        &signing_key,
        1,
        1,
        vec![0, 1],
        vec![],
        "first post",
        DEFAULT_CREATED_AT + HOUR,
    );
    let sig_1 = bundle_signature(&post_1);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_1],
        })
        .await
        .expect("post_1 put failed");

    let root_after_1 = leaf_hash(&sig_1);
    let post_2 = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        root_after_1.clone(),
        "second post",
        DEFAULT_CREATED_AT + 2 * HOUR,
    );
    let sig_2 = bundle_signature(&post_2);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_2],
        })
        .await
        .expect("post_2 put failed");

    // A rotates to revoke B. Target pins post_2 as the head.
    let revoked = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![make_revocation_bound(
            &signing_key,
            COLLECTION_FEED,
            sig_2.clone(),
            root_after_1.clone(),
            1,
        )],
        servers: None,
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked,
        DEFAULT_CREATED_AT + 3 * HOUR,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![rotation],
        })
        .await
        .expect("rotation put failed");

    // B forges a post_3 after revocation. The signature is valid (B still
    // holds the key), so the server stores it.
    let post_3 = make_post_bundle(
        &identity,
        &signing_key,
        3,
        1,
        vec![0, 3],
        node_hash(&leaf_hash(&sig_1), &leaf_hash(&sig_2)),
        "forged post",
        DEFAULT_CREATED_AT + 4 * HOUR,
    );
    let sig_3 = bundle_signature(&post_3);

    // B forges a post_3 after revocation. The signature is valid (B still
    // holds the key), but `authorize_event_signer` rejects it because B's
    // key is revoked and post_3 is not within the committed bound. The
    // server returns the rejection in the response errors, not as a gRPC
    // error.
    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_3],
        })
        .await
        .expect("put_events call succeeded");
    let inner = response.into_inner();
    assert!(
        inner.errors.iter().any(|e| e.message.contains("revoked")),
        "post-revocation event must be rejected, got errors: {:?}",
        inner.errors,
    );

    // Also verify it didn't end up in the events table by accident.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;
    assert!(
        !bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == sig_3)
            .unwrap_or(false)),
        "post-revocation event must NOT appear in list_events",
    );
}

/// B writes three posts, but the version of post_2 that reaches the
/// server differs from the version the rotator hashed into the bound.
/// The server's canonical reconstruction yields a different root than
/// the bound records, so no proof can be generated for any of B's
/// pre-revocation events.
#[tokio::test]
async fn rewritten_event_invalidates_proofs() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();
    let signing_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![public_key_of(&signing_key)],
        revocation_bounds: vec![],
        servers: None,
    };
    let identity = initial.derive_hex_key();

    // Genesis.
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        DEFAULT_CREATED_AT,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis],
        })
        .await
        .expect("genesis put failed");

    // post_1 — same in both views.
    let post_1 = make_post_bundle(
        &identity,
        &signing_key,
        1,
        1,
        vec![0, 1],
        vec![],
        "first post",
        DEFAULT_CREATED_AT + HOUR,
    );
    let sig_1 = bundle_signature(&post_1);

    // post_2_original — the version the rotator hashes into the bound.
    // Never PUT to the server.
    let post_2_original = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        leaf_hash(&sig_1),
        "ORIGINAL second post",
        DEFAULT_CREATED_AT + 2 * HOUR,
    );
    let sig_2_original = bundle_signature(&post_2_original);

    // post_3 — references the rotator's view of history. previous_root is
    // the MMR over [sig_1, sig_2_original].
    let root_after_2_original =
        node_hash(&leaf_hash(&sig_1), &leaf_hash(&sig_2_original));
    let post_3 = make_post_bundle(
        &identity,
        &signing_key,
        3,
        1,
        vec![0, 3],
        root_after_2_original.clone(),
        "third post",
        DEFAULT_CREATED_AT + 3 * HOUR,
    );
    let sig_3 = bundle_signature(&post_3);

    // post_2_rewritten — different content at the same (collection, identity,
    // signer, sequence). This is what the server actually receives.
    let post_2_rewritten = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        leaf_hash(&sig_1),
        "REWRITTEN second post",
        DEFAULT_CREATED_AT + 2 * HOUR,
    );

    // A revokes B. Target pins post_3 as head with the rotator's-view root.
    let revoked = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![make_revocation_bound(
            &signing_key,
            COLLECTION_FEED,
            sig_3.clone(),
            root_after_2_original.clone(),
            2,
        )],
        servers: None,
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked,
        DEFAULT_CREATED_AT + 4 * HOUR,
    );

    // PUT in order. Note: post_2_rewritten replaces post_2_original — the
    // original is never seen by the server.
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_1, post_2_rewritten, post_3, rotation],
        })
        .await
        .expect("puts failed");

    // List events.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity.clone()),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;

    // post_1 must come back with NO proof — the server's canonical
    // reconstruction over [sig_1, sig_2_rewritten] yields a different root
    // than the bound recorded (which used sig_2_original).
    let bundle_1 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_1)
                .unwrap_or(false)
        })
        .expect("post_1 missing from list_events response");
    assert!(
        bundle_1.event_proofs.is_empty(),
        "rewriting an in-tree event must invalidate proofs for sibling leaves; got {} proofs",
        bundle_1.event_proofs.len(),
    );

    // Sanity: the recomputed roots from the two views are in fact different.
    let root_after_2_rewritten = node_hash(
        &leaf_hash(&sig_1),
        &leaf_hash(&bundle_signature(&make_post_bundle(
            &identity,
            &signing_key,
            2,
            1,
            vec![0, 2],
            leaf_hash(&sig_1),
            "REWRITTEN second post",
            DEFAULT_CREATED_AT + 2 * HOUR,
        ))),
    );
    assert_ne!(
        root_after_2_original, root_after_2_rewritten,
        "rewritten root must differ from the bound's recorded root",
    );
}

#[tokio::test]
async fn put_verification_claim_is_ingested_and_listable() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    };
    let identity = initial.derive_hex_key();

    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        initial,
        DEFAULT_CREATED_AT,
    );
    let claim = make_verification_claim_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        "alice",
        DEFAULT_CREATED_AT + HOUR,
    );
    let claim_signature = bundle_signature(&claim);

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis, claim],
        })
        .await
        .expect("put_events failed")
        .into_inner();
    // Ingestion (and the claim/schema child-table writes) must succeed.
    assert!(
        response.errors.is_empty(),
        "ingest reported errors: {:?}",
        response.errors
    );

    let listed = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity),
                collection: Some(COLLECTION_VERIFICATIONS),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed")
        .into_inner();

    assert!(
        listed.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .is_some_and(|s| s.signature == claim_signature)),
        "stored verification claim not returned",
    )
}

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

#[tokio::test]
#[ignore] // Currently failing, to be fixed in #201.
async fn trusted_labels_served_in_feed_response() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();
    let mod_key = test_moderator_key();
    let mod_identity = test_moderator_identity();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "hello label world",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);
    let labels_sig = publish_labels(
        &mut event,
        &mod_identity,
        &mod_key,
        target_key.clone(),
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    // Get identity feed — no omit_labels.
    let resp = feed
        .get_identity_feed(GetIdentityFeedRequest {
            identity: author_identity.clone(),
            page_params: Some(PageParams {
                limit: Some(10),
                ..Default::default()
            }),
            omit_labels: vec![],
        })
        .await
        .expect("get_identity_feed failed")
        .into_inner();

    // Post is present.
    assert!(
        resp.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be returned in identity feed",
    );

    // Label event is present in event_hints.
    let label_bundle = resp
        .event_hints
        .iter()
        .find_map(|h| {
            let b = h.event_bundle.as_ref()?;
            if b.signed_event
                .as_ref()
                .map(|se| se.signature == labels_sig)
                .unwrap_or(false)
            {
                Some(b)
            } else {
                None
            }
        })
        .expect("Labels event should appear in event_hints");

    // The label event content decodes to a Labels targeting our post.
    assert_is_labels_bundle(
        label_bundle,
        &target_key,
        &["sexually-suggestive"],
    );

    // The label event carries the moderator identity (labeler visible).
    let label_event = label_bundle
        .signed_event
        .as_ref()
        .and_then(|se| Event::decode(se.event_bytes.as_slice()).ok())
        .expect("valid event bytes in label bundle");
    let label_event_key = label_event.key.as_ref().expect("event has key");
    assert_eq!(
        label_event_key.identity, mod_identity,
        "label event should carry the moderator identity",
    );
    assert_eq!(label_event_key.collection, COLLECTION_LABELS);
}

#[tokio::test]
async fn labeler_identity_served_with_feed_response() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();
    let mod_key = test_moderator_key();
    let mod_identity = test_moderator_identity();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "post labeled by a stranger",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    publish_labels(
        &mut event,
        &mod_identity,
        &mod_key,
        get_post_event_key(&author_identity, &author_key),
        vec!["violence".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    let resp = feed
        .get_identity_feed(GetIdentityFeedRequest {
            identity: author_identity.clone(),
            page_params: Some(PageParams {
                limit: Some(10),
                ..Default::default()
            }),
            omit_labels: vec![],
        })
        .await
        .expect("get_identity_feed failed")
        .into_inner();

    let keys: Vec<EventKey> = resp
        .event_hints
        .iter()
        .filter_map(|hint| {
            let signed = hint.event_bundle.as_ref()?.signed_event.as_ref()?;
            Event::decode(signed.event_bytes.as_slice()).ok()?.key
        })
        .collect();

    let labeler_identity_served = keys.iter().any(|key| {
        key.collection == COLLECTION_IDENTITY && key.identity == mod_identity
    });

    assert!(
        labeler_identity_served,
        "labeler identity chain should be hinted so the client can \
         validate the Labels event",
    );
}

#[tokio::test]
#[ignore] // Currently failing, to be fixed in #201.
async fn omit_labels_hides_labeled_post() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();
    let mod_key = test_moderator_key();
    let mod_identity = test_moderator_identity();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "hide-me post",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);
    publish_labels(
        &mut event,
        &mod_identity,
        &mod_key,
        target_key,
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    // Query with omit_labels = ["sexually-suggestive"] → post should be hidden.
    let resp = feed
        .get_identity_feed(GetIdentityFeedRequest {
            identity: author_identity,
            page_params: Some(PageParams {
                limit: Some(10),
                ..Default::default()
            }),
            omit_labels: vec!["sexually-suggestive".to_string()],
        })
        .await
        .expect("get_identity_feed failed")
        .into_inner();

    assert!(
        !resp.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be hidden when omit_labels contains 'sexually-suggestive'",
    );
}

#[tokio::test]
#[ignore] // Currently failing, to be fixed in #201.
async fn omit_labels_non_matching_keeps_post_and_labels() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();
    let mod_key = test_moderator_key();
    let mod_identity = test_moderator_identity();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "warn-label post",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);
    let labels_sig = publish_labels(
        &mut event,
        &mod_identity,
        &mod_key,
        target_key.clone(),
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    // Query with a different label — post should stay, label event should be
    // present in the collection (client renders Warn from the collection).
    let resp = feed
        .get_identity_feed(GetIdentityFeedRequest {
            identity: author_identity,
            page_params: Some(PageParams {
                limit: Some(10),
                ..Default::default()
            }),
            omit_labels: vec!["hate".to_string()],
        })
        .await
        .expect("get_identity_feed failed")
        .into_inner();

    // Post is present.
    assert!(
        resp.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be returned when omit_labels doesn't match its label",
    );

    // Label event is still in event_hints.
    let _label_bundle = resp
        .event_hints
        .iter()
        .find_map(|h| {
            let b = h.event_bundle.as_ref()?;
            if b.signed_event
                .as_ref()
                .map(|se| se.signature == labels_sig)
                .unwrap_or(false)
            {
                Some(b)
            } else {
                None
            }
        })
        .expect(
            "Labels event should still be present in event_hints for Warn/Show",
        );
}

#[tokio::test]
async fn untrusted_labels_not_indexed() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();

    // Impostor — a random key that is NOT the configured moderator.
    let impostor_key = generate_signing_key();
    let impostor_identity = Identity {
        rotation_keys: vec![public_key_of(&impostor_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;
    publish_genesis(
        &mut event,
        &impostor_identity,
        &impostor_key,
        DEFAULT_CREATED_AT,
    )
    .await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "test unmoderated",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);

    // Publish a Labels event from the impostor (NOT the trusted moderator).
    let impostor_labels_sig = publish_labels(
        &mut event,
        &impostor_identity,
        &impostor_key,
        target_key.clone(),
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    // Feed query — no omit_labels.
    let resp = feed
        .get_identity_feed(GetIdentityFeedRequest {
            identity: author_identity,
            page_params: Some(PageParams {
                limit: Some(10),
                ..Default::default()
            }),
            omit_labels: vec![],
        })
        .await
        .expect("get_identity_feed failed")
        .into_inner();

    // Post is present (not hidden — impostor's label is not trusted).
    assert!(
        resp.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be returned even though impostor labeled it",
    );

    // The impostor's Labels event is NOT in event_hints.
    assert!(
        !resp.event_hints.iter().any(|h| h
            .event_bundle
            .as_ref()
            .and_then(|b| b
                .signed_event
                .as_ref()
                .map(|se| se.signature == impostor_labels_sig))
            .unwrap_or(false)),
        "untrusted Labels event must NOT appear in event_hints collection",
    );
}

#[tokio::test]
async fn omit_labels_untrusted_label_does_not_hide() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();

    let impostor_key = generate_signing_key();
    let impostor_identity = Identity {
        rotation_keys: vec![public_key_of(&impostor_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;
    publish_genesis(
        &mut event,
        &impostor_identity,
        &impostor_key,
        DEFAULT_CREATED_AT,
    )
    .await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "impostor-labeled post",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);
    publish_labels(
        &mut event,
        &impostor_identity,
        &impostor_key,
        target_key,
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    // Query with omit_labels = ["sexually-suggestive"] — the label came from an untrusted
    // source so it was never indexed; the post should NOT be hidden.
    let resp = feed
        .get_identity_feed(GetIdentityFeedRequest {
            identity: author_identity,
            page_params: Some(PageParams {
                limit: Some(10),
                ..Default::default()
            }),
            omit_labels: vec!["sexually-suggestive".to_string()],
        })
        .await
        .expect("get_identity_feed failed")
        .into_inner();

    assert!(
        resp.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "untrusted label must not be filterable via omit_labels — post should still appear",
    );
}

#[tokio::test]
async fn thread_no_labels_returns_post() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "thread test post",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);

    let resp = feed
        .get_post_thread(GetPostThreadRequest {
            event_key: Some(target_key),
            limit: 10,
            omit_labels: vec![],
        })
        .await
        .expect("get_post_thread failed")
        .into_inner();

    // Post is present in the thread.
    assert!(
        resp.thread.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be returned in thread when no omit_labels",
    );

    // No label bundles in event_hints (no labels were published).
    for hint in &resp.event_hints {
        if let Some(bundle) = &hint.event_bundle {
            if let Some(se) = &bundle.signed_event {
                if let Ok(event) = Event::decode(se.event_bytes.as_slice()) {
                    if let Some(ek) = &event.key {
                        if ek.collection == COLLECTION_LABELS {
                            panic!(
                                "no Labels events should appear in hints without labels being published"
                            );
                        }
                    }
                }
            }
        }
    }
}

#[tokio::test]
#[ignore] // Currently failing, to be fixed in #201.
async fn thread_omit_labels_matching_hides_post() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();
    let mod_key = test_moderator_key();
    let mod_identity = test_moderator_identity();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "hide-me thread post",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);
    let labels_sig = publish_labels(
        &mut event,
        &mod_identity,
        &mod_key,
        target_key.clone(),
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;
    let resp = feed
        .get_post_thread(GetPostThreadRequest {
            event_key: Some(target_key.clone()),
            limit: 10,
            omit_labels: vec!["sexually-suggestive".to_string()],
        })
        .await
        .expect("get_post_thread failed")
        .into_inner();

    // Post is hidden from the thread.
    assert!(
        !resp.thread.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be hidden from thread when omit_labels matches",
    );

    // Label event is present in event_hints.
    let label_bundle = resp
        .event_hints
        .iter()
        .find_map(|h| {
            let b = h.event_bundle.as_ref()?;
            if b.signed_event
                .as_ref()
                .map(|se| se.signature == labels_sig)
                .unwrap_or(false)
            {
                Some(b)
            } else {
                None
            }
        })
        .expect("Labels event should appear in event_hints");

    assert_is_labels_bundle(
        label_bundle,
        &target_key,
        &["sexually-suggestive"],
    );
}

#[tokio::test]
#[ignore] // Currently failing, to be fixed in #201.
async fn thread_omit_labels_not_matching_keeps_post() {
    let mut event = connect_event_sync().await;
    let mut feed = connect_feeds().await;

    let author_key = generate_signing_key();
    let author_identity = Identity {
        rotation_keys: vec![public_key_of(&author_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
    }
    .derive_hex_key();
    let mod_key = test_moderator_key();
    let mod_identity = test_moderator_identity();

    publish_genesis(
        &mut event,
        &author_identity,
        &author_key,
        DEFAULT_CREATED_AT,
    )
    .await;
    ensure_moderator_setup().await;

    let post_sig = publish_post(
        &mut event,
        &author_identity,
        &author_key,
        "warn thread post",
        DEFAULT_CREATED_AT + HOUR,
    )
    .await;

    let target_key = get_post_event_key(&author_identity, &author_key);
    let labels_sig = publish_labels(
        &mut event,
        &mod_identity,
        &mod_key,
        target_key.clone(),
        vec!["sexually-suggestive".to_string()],
        DEFAULT_CREATED_AT + 2 * HOUR,
    )
    .await;

    let resp = feed
        .get_post_thread(GetPostThreadRequest {
            event_key: Some(target_key),
            limit: 10,
            omit_labels: vec!["hate".to_string()],
        })
        .await
        .expect("get_post_thread failed")
        .into_inner();

    // Post is present.
    assert!(
        resp.thread.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_sig)
            .unwrap_or(false)),
        "post should be returned when omit_labels doesn't match its label",
    );

    // Label event is still in event_hints.
    let _label_bundle = resp
        .event_hints
        .iter()
        .find_map(|h| {
            let b = h.event_bundle.as_ref()?;
            if b.signed_event
                .as_ref()
                .map(|se| se.signature == labels_sig)
                .unwrap_or(false)
            {
                Some(b)
            } else {
                None
            }
        })
        .expect(
            "Labels event should still be present in event_hints for non-matching omit",
        );
}

#[tokio::test]
async fn search_users_no_match() {
    expect_searched_users(
        SearchUsersRequest {
            query: random_string(),
            sort_by: None,
            page_params: None,
        },
        Vec::new(),
    )
    .await;
}

#[tokio::test]
async fn search_users_match_profile_name() {
    let mut client = TestClient::new().await;

    let profile_name = random_string();
    let profile_update = ProfileUpdate {
        name: Some(profile_name.clone()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name,
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;
}

#[tokio::test]
async fn search_users_match_description() {
    let mut client = TestClient::new().await;

    let description = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: Some(description.clone()),
        alias: None,
    };
    client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: description.clone(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;
}

#[tokio::test]
async fn search_users_match_alias() {
    let mut client = TestClient::new().await;

    let alias = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: Some(alias.clone()),
    };
    client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: alias,
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;
}

#[tokio::test]
async fn search_users_order_by_rank() {
    let query = random_string();

    let mut expected = Vec::new();
    for n in 1..=3 {
        let mut client = TestClient::new().await;
        let description = repeated_string(n, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(random_string()),
            avatar: None,
            banner: None,
            description: Some(description),
            alias: None,
        };
        client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
        client.submit_events().await;
        expected.push(profile_update);
    }
    // Reverse the results as the more hits we get, the higher the rank should be.
    expected.reverse();

    expect_searched_users(
        SearchUsersRequest {
            query,
            sort_by: None,
            page_params: None,
        },
        expected,
    )
    .await;
}

#[tokio::test]
async fn search_users_order_by_alpha() {
    let query = random_string();

    let mut expected = Vec::new();
    for (n, name) in ["A", "B", "C"].into_iter().enumerate() {
        let mut client = TestClient::new().await;
        let description = repeated_string(n + 1, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(name.to_owned()),
            avatar: None,
            banner: None,
            description: Some(description),
            alias: None,
        };
        client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
        client.submit_events().await;
        expected.push(profile_update);
    }

    expect_searched_users(
        SearchUsersRequest {
            query,
            sort_by: Some(SortUsersBy::Alpha as _),
            page_params: None,
        },
        expected,
    )
    .await;
}

#[tokio::test]
async fn search_users_pagination_order_by_rank() {
    let mut search = search_service().await;
    let query = random_string();

    let mut expected = Vec::new();
    for n in 1..=3 {
        let mut client = TestClient::new().await;
        let description = repeated_string(n, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(random_string()),
            avatar: None,
            banner: None,
            description: Some(description),
            alias: None,
        };
        client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
        client.submit_events().await;
        expected.push(profile_update);
    }
    // Reverse the results as the more hits we get, the higher the rank should be.
    expected.reverse();

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: None,
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
            },
            vec![expected],
            |request| async {
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }

    // Backward.
    expected.reverse();
    let mut expected_iter = expected.clone().into_iter();
    let _ = expected_iter.next(); // Skip first (previously last) result.
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: None,
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
            },
            vec![expected],
            |request| async {
                let mut search = search_service().await;
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
}

#[tokio::test]
async fn search_users_pagination_order_by_alpha() {
    let mut search = search_service().await;
    let query = random_string();

    let mut expected = Vec::new();
    for (n, name) in ["A", "B", "C"].into_iter().enumerate() {
        let mut client = TestClient::new().await;
        let description = repeated_string(n + 1, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(name.to_owned()),
            avatar: None,
            banner: None,
            description: Some(description),
            alias: None,
        };
        client.profile_update(profile_update.clone(), DEFAULT_CREATED_AT);
        client.submit_events().await;
        expected.push(profile_update);
    }

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: Some(SortUsersBy::Alpha as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
            },
            vec![expected],
            |request| async {
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }

    // Backward.
    expected.reverse();
    let mut expected_iter = expected.clone().into_iter();
    let _ = expected_iter.next(); // Skip first (previously last) result.
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: Some(SortUsersBy::Alpha as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
            },
            vec![expected],
            |request| async {
                let mut search = search_service().await;
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
}

async fn expect_searched_users(
    request: SearchUsersRequest,
    expected: Vec<ProfileUpdate>,
) {
    expect_searched_users2(request, expected, |request| async {
        let mut search = search_service().await;
        let response = search.search_users(request).await.unwrap();
        response.into_inner().results
    })
    .await
}

async fn expect_searched_users2<F, Fut>(
    request: SearchUsersRequest,
    expected: Vec<ProfileUpdate>,
    get_results: F,
) where
    F: FnOnce(SearchUsersRequest) -> Fut,
    Fut: Future<Output = Vec<SearchResult>>,
{
    eprintln!("query: {:#?}", request.query);
    let results = get_results(request).await;
    eprintln!("expected: {expected:#?}");
    eprintln!("results: {:#?}", fmt_search_results(&results));

    assert_eq!(
        results.len(),
        expected.len(),
        "unexpected amount of results"
    );
    for (result, expected) in results.into_iter().zip(expected) {
        let event = result.event_bundle.unwrap();
        let Some(serialized_content) = event.serialized_content.as_ref() else {
            panic!("missing content in event: {event:?}");
        };
        let Ok(content) = Content::decode(&*serialized_content.content_bytes)
        else {
            panic!("failed to decode event: {event:?}");
        };
        let Some(ContentBody::ProfileUpdate(update)) = content.content_body
        else {
            panic!("unexpected content body: {event:?}");
        };
        assert_eq!(update, expected);
        // Hard to assert the actual rank, so just check we have it.
        assert!(result.rank >= 0.0);
    }
}

#[tokio::test]
async fn search_posts_no_match() {
    expect_searched_posts(
        SearchPostsRequest {
            query: random_string(),
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        Vec::new(),
    )
    .await;
}

#[tokio::test]
async fn search_posts_match_text() {
    let mut client = TestClient::new().await;

    let post_text = random_string();
    client.post_text(&post_text, DEFAULT_CREATED_AT);
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query: post_text.clone(),
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![Post {
            text: post_text,
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
        }],
    )
    .await;
}

#[tokio::test]
async fn search_posts_order_by_rank() {
    let mut client = TestClient::new().await;

    let query = random_string();
    let post_text1 = format!("{query} first.");
    let post_text2 = format!("{query} second. {query}");
    client.post_text(&post_text1, DEFAULT_CREATED_AT);
    client.post_text(&post_text2, DEFAULT_CREATED_AT + 1);
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query,
            sort_by: Some(SortPostsBy::Default as _),
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![
            Post {
                text: post_text2,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
            },
            Post {
                text: post_text1,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
            },
        ],
    )
    .await;
}

#[tokio::test]
async fn search_posts_order_by_latest() {
    let mut client = TestClient::new().await;

    let query = random_string();
    let post_text1 = format!("{query} first.");
    let post_text2 = format!("{query} second.");
    client.post_text(&post_text1, DEFAULT_CREATED_AT);
    client.post_text(&post_text2, DEFAULT_CREATED_AT + 1);
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query,
            sort_by: Some(SortPostsBy::Latest as _),
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![
            Post {
                text: post_text2,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
            },
            Post {
                text: post_text1,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
            },
        ],
    )
    .await;
}

#[tokio::test]
#[ignore] // Currently failing, to be fixed in #201.
async fn search_posts_omit_labels() {
    let query = random_string();
    let label = random_string();

    let mut client = TestClient::new().await;
    client.post_text(&query, DEFAULT_CREATED_AT);
    let post_event_key = client.get_last_event_key();
    client.submit_events().await;

    let mut trusted_moderator = TestClient::trusted_moderator().await;
    trusted_moderator.label(
        Labels {
            event_key: Some(post_event_key),
            label_values: vec![label.clone()],
        },
        DEFAULT_CREATED_AT + 1,
    );
    trusted_moderator.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query,
            sort_by: None,
            page_params: None,
            omit_labels: vec![label],
        },
        vec![], // The post should be hidden.
    )
    .await;
}

#[tokio::test]
async fn search_posts_pagination_order_by_rank() {
    let mut search = search_service().await;
    let mut client = TestClient::new().await;

    let query = random_string();
    let mut expected = Vec::new();
    for n in 1..=3 {
        let text = format!("{n}. {}", repeated_string(n, &query, " "));
        client.post_text(&text, DEFAULT_CREATED_AT);
        expected.push(Post {
            text,
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
        });
    }
    expected.reverse();
    client.submit_events().await;

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: None,
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }

    // Backward.
    expected.reverse();
    let mut expected_iter = expected.clone().into_iter();
    let _ = expected_iter.next(); // Skip first (previously last) result.
    while let Some(expected) = expected_iter.next() {
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: None,
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
}

#[tokio::test]
async fn search_posts_pagination_order_by_latest() {
    let mut search = search_service().await;
    let mut client = TestClient::new().await;

    let query = random_string();
    let mut expected = Vec::new();
    for n in 1..=3 {
        let text = format!("{n}. {query}.");
        client.post_text(&text, DEFAULT_CREATED_AT + n);
        expected.push(Post {
            text,
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
        });
    }
    expected.reverse();
    client.submit_events().await;

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: Some(SortPostsBy::Latest as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }

    // Backward.
    expected.reverse();
    let mut expected_iter = expected.clone().into_iter();
    let _ = expected_iter.next(); // Skip first (previously last) result.
    while let Some(expected) = expected_iter.next() {
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: Some(SortPostsBy::Latest as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
}

async fn expect_searched_posts(
    request: SearchPostsRequest,
    expected: Vec<Post>,
) {
    expect_searched_posts2(request, expected, |request| async {
        let mut search = search_service().await;
        let response = search.search_posts(request).await.unwrap();
        response.into_inner().results
    })
    .await
}

async fn expect_searched_posts2<F, Fut>(
    request: SearchPostsRequest,
    expected: Vec<Post>,
    get_results: F,
) where
    F: FnOnce(SearchPostsRequest) -> Fut,
    Fut: Future<Output = Vec<SearchResult>>,
{
    eprintln!("query: {:#?}", request.query);
    let results = get_results(request).await;
    eprintln!("expected: {expected:#?}");
    eprintln!("results: {:#?}", fmt_search_results(&results));

    assert_eq!(
        results.len(),
        expected.len(),
        "unexpected amount of results"
    );
    for (result, expected) in results.into_iter().zip(expected) {
        let event = result.event_bundle.unwrap();
        let Some(serialized_content) = event.serialized_content.as_ref() else {
            panic!("missing content in event: {event:?}");
        };
        let Ok(content) = Content::decode(&*serialized_content.content_bytes)
        else {
            panic!("failed to decode event: {event:?}");
        };
        let Some(ContentBody::Post(post)) = content.content_body else {
            panic!("unexpected content body: {event:?}");
        };
        assert_eq!(post, expected);
        // Hard to assert the actual rank, so just check we have it.
        assert!(result.rank >= 0.0);
    }
}

#[tokio::test]
async fn following() {
    let mut search = graph_service().await;

    let mut follower = TestClient::new().await;
    let mut followees = Vec::with_capacity(2);
    for _ in 0..followees.capacity() {
        let mut followee = TestClient::new().await;
        followee.submit_events().await; // Create the indetity.
        let id = followee.identity().to_owned();
        follower.follow_identity(id.clone(), DEFAULT_CREATED_AT);
        followees.push(id);
    }
    let last_follow = follower.get_last_event_key();
    follower.submit_events().await;
    eprintln!("Follower: {}", follower.identity());
    eprintln!("Followees: {followees:?}");

    check_following(&mut search, follower.identity().to_owned(), &followees)
        .await;
    check_followers(&mut search, followees[1].clone(), &[follower.identity()])
        .await;

    follower.delete_key(last_follow, DEFAULT_CREATED_AT + 1);
    let no_followers = followees.pop().unwrap();
    follower.submit_events().await;

    check_following(&mut search, follower.identity().to_owned(), &followees)
        .await;
    check_followers(&mut search, no_followers, &[]).await;
}

async fn check_following(
    search: &mut GraphServiceClient<tonic::transport::Channel>,
    for_identity: String,
    expected: &[String],
) {
    let result = search
        .list_following(ListFollowingRequest {
            identity: for_identity.clone(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.event_bundles.len(), expected.len());
    for event in &result.event_bundles {
        dbg!(&event);
        let signed_event =
            Event::decode(&*event.signed_event.as_ref().unwrap().event_bytes)
                .unwrap();
        let followee_identity = signed_event.key.unwrap().identity;
        assert_eq!(followee_identity, for_identity);

        let content = Content::decode(
            &*event.serialized_content.as_ref().unwrap().content_bytes,
        )
        .unwrap();
        let Some(ContentBody::Follow(follow)) = content.content_body else {
            panic!("unexpected event content: {content:?}");
        };
        assert!(
            expected.contains(&follow.identity),
            "id: {}, expected: {expected:?}",
            follow.identity
        );
    }
}

async fn check_followers(
    search: &mut GraphServiceClient<tonic::transport::Channel>,
    for_identity: String,
    expected: &[&str],
) {
    let result = search
        .list_followers(ListFollowersRequest {
            identity: for_identity.clone(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.event_bundles.len(), expected.len());
    for event in &result.event_bundles {
        let signed_event =
            Event::decode(&*event.signed_event.as_ref().unwrap().event_bytes)
                .unwrap();
        let followee_identity = signed_event.key.unwrap().identity;
        assert!(
            expected.contains(&&*followee_identity),
            "id: {}, expected: {expected:?}",
            followee_identity
        );

        let content = Content::decode(
            &*event.serialized_content.as_ref().unwrap().content_bytes,
        )
        .unwrap();
        let Some(ContentBody::Follow(follow)) = content.content_body else {
            panic!("unexpected event content: {content:?}");
        };
        assert_eq!(for_identity, follow.identity);
    }
}

#[tokio::test]
async fn global_top_feed_exists() {
    let mut feeds = connect_feeds().await;

    let mut client = TestClient::new().await;
    client.post_text("Post 1", DEFAULT_CREATED_AT);
    client.post_text("Post 2", DEFAULT_CREATED_AT + 1);
    client.submit_events().await;

    let request = GetExploreFeedRequest {
        identity: None,
        page_params: None,
        omit_labels: Vec::new(),
        sort_by: Some(SortPostsBy::Top.into()),
    };
    let result = feeds.get_explore_feed(request).await.unwrap().into_inner();

    assert!(result.event_bundles.len() >= 2);
    // NOTE: because the global feed contains all posts made it's difficult to
    // test it without isolation, which we don't have between tests or between
    // test runs.
}

#[tokio::test]
async fn personal_top_feed_empty() {
    let mut client = TestClient::new().await;
    client.submit_events().await;
    let follower = client.identity();

    // Not following anyone and hasn't made any posts themselves, so no results.
    personal_top_feed(follower, &[]).await;
}

#[tokio::test]
async fn personal_top_feed_ordering() {
    let mut client = TestClient::new().await;
    client.post_text("Post 1", DEFAULT_CREATED_AT);
    let post1_key = client.get_last_event_key();
    client.post_text("Post 2", DEFAULT_CREATED_AT + 1);
    let post2_key = client.get_last_event_key();
    client.submit_events().await;
    let followee = client.identity();

    let mut client = TestClient::new().await;
    client.follow_identity(followee.to_owned(), DEFAULT_CREATED_AT);
    client.thumbs_up(post2_key.clone(), DEFAULT_CREATED_AT + 2);
    client.submit_events().await;
    let follower = client.identity();

    personal_top_feed(follower, &[post2_key, post1_key]).await;
}

#[tokio::test]
async fn personal_top_feed_pagination() {
    // Followee 1, post 1.
    let mut client1 = TestClient::new().await;
    client1.post_text("Post 1", DEFAULT_CREATED_AT);
    let post1_key = client1.get_last_event_key();
    client1.submit_events().await;
    let followee1 = client1.identity().to_owned();

    // Followee 2, post 2.
    let mut client2 = TestClient::new().await;
    client2.post_text("Post 2", DEFAULT_CREATED_AT + 1);
    let post2_key = client2.get_last_event_key();
    client2.submit_events().await;
    let followee2 = client2.identity().to_owned();

    // Follower, post 3.
    let mut client3 = TestClient::new().await;
    client3.post_text("Post 3", DEFAULT_CREATED_AT + 2);
    let post3_key = client3.get_last_event_key();
    client3.follow_identity(followee1, DEFAULT_CREATED_AT);
    client3.follow_identity(followee2, DEFAULT_CREATED_AT);
    client3.submit_events().await;
    let follower = client3.identity().to_owned();

    // Post 1, 1 reaction.
    client3.thumbs_up(post1_key.clone(), DEFAULT_CREATED_AT + 5);
    // Post 2, 2 reactions.
    client3.thumbs_up(post2_key.clone(), DEFAULT_CREATED_AT + 5);
    client2.thumbs_up(post2_key.clone(), DEFAULT_CREATED_AT + 5);
    // Post 3, 3 reactions.
    client3.thumbs_up(post3_key.clone(), DEFAULT_CREATED_AT + 5);
    client2.thumbs_up(post3_key.clone(), DEFAULT_CREATED_AT + 5);
    client1.thumbs_up(post3_key.clone(), DEFAULT_CREATED_AT + 5);
    client1.submit_events().await;
    client2.submit_events().await;
    client3.submit_events().await;

    let mut feeds = connect_feeds().await;

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter =
        [post3_key.clone(), post2_key.clone(), post1_key.clone()].into_iter();
    while let Some(expected) = expected_iter.next() {
        let request = async {
            let request = GetExploreFeedRequest {
                identity: Some(follower.clone()),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
                omit_labels: Vec::new(),
                sort_by: Some(SortPostsBy::Top.into()),
            };
            let response =
                feeds.get_explore_feed(request).await.unwrap().into_inner();
            page_info = response.page_info.clone();
            response
        };
        top_feed(request, &[expected]).await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }

    // Backward.
    let mut expected_iter = [post2_key, post3_key].into_iter();
    while let Some(expected) = expected_iter.next() {
        let request = async {
            let mut feeds = connect_feeds().await;
            let request = GetExploreFeedRequest {
                identity: Some(follower.clone()),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
                omit_labels: Vec::new(),
                sort_by: Some(SortPostsBy::Top.into()),
            };
            let response =
                feeds.get_explore_feed(request).await.unwrap().into_inner();
            page_info = response.page_info.clone();
            response
        };
        top_feed(request, &[expected]).await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
}

async fn personal_top_feed(for_identity: &str, expected: &[EventKey]) {
    eprintln!("for_identity: {for_identity:?}");
    let request = async {
        let mut feeds = connect_feeds().await;
        let request = GetExploreFeedRequest {
            identity: Some(for_identity.to_owned()),
            page_params: None,
            omit_labels: Vec::new(),
            sort_by: Some(SortPostsBy::Top.into()),
        };
        feeds.get_explore_feed(request).await.unwrap().into_inner()
    };
    top_feed(request, expected).await
}

async fn top_feed<Fut>(request: Fut, expected: &[EventKey])
where
    Fut: Future<Output = GetFeedResponse>,
{
    eprintln!("expected: {expected:#?}");
    let result = request.await;
    eprintln!("results: {:#?}", &result.event_bundles);

    assert_eq!(result.event_bundles.len(), expected.len());
    for (event, expected) in result.event_bundles.iter().zip(expected) {
        let content = Content::decode(
            &*event.serialized_content.as_ref().unwrap().content_bytes,
        )
        .unwrap();
        if !matches!(&content.content_body, Some(ContentBody::Post(_))) {
            panic!("unexpected event content: {content:?}");
        };

        let event =
            Event::decode(&*event.signed_event.as_ref().unwrap().event_bytes)
                .unwrap();
        let key = event.key.as_ref().unwrap();
        assert_eq!(key, expected, "expected: {expected:?}, event: {event:?}");
    }
}
