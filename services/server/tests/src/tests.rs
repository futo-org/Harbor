use integration_tests::proto::{ListEventsRequest, PutEventsRequest};
use integration_tests::{
    connect_event_sync, generate_signing_key, make_identity_bytes, make_identity_claim_bundle,
    make_identity_create_bundle, make_identity_issue_bundle, make_identity_revoke_bundle,
    make_post_bundle, DEFAULT_CREATED_AT,
};

const HOUR: u64 = 3_600_000;

#[tokio::test]
async fn test_list_events_empty() {
    let mut client = connect_event_sync().await;

    let response = client
        .list_events(ListEventsRequest {
            limit: Some(10),
            ..Default::default()
        })
        .await
        .expect("list_events failed");

    let bundles = response.into_inner().event_bundles;
    println!("list_events returned {} bundles", bundles.len());
}

#[tokio::test]
async fn test_put_single_event() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();

    let bundle = make_post_bundle(1, &key, "Hello, polycentric!", DEFAULT_CREATED_AT);

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await;

    assert!(response.is_ok(), "put_events failed: {:?}", response.err());
}

#[tokio::test]
async fn test_put_then_list_events() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();

    let bundle = make_post_bundle(1, &key, "A test post", DEFAULT_CREATED_AT);

    client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("put_events failed");

    let response = client
        .list_events(ListEventsRequest {
            limit: Some(100),
            ..Default::default()
        })
        .await
        .expect("list_events failed");

    let bundles = response.into_inner().event_bundles;
    assert!(!bundles.is_empty(), "expected at least one event after put");
}

#[tokio::test]
async fn test_put_multiple_events() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();

    let bundles: Vec<_> = (1..=5)
        .map(|i| make_post_bundle(i, &key, &format!("Post #{i}"), DEFAULT_CREATED_AT))
        .collect();

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: bundles,
        })
        .await;

    assert!(
        response.is_ok(),
        "put_events with multiple events failed: {:?}",
        response.err()
    );
}

#[tokio::test]
async fn test_put_invalid_signature_rejected() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();

    let mut bundle = make_post_bundle(1, &key, "Bad signature test", DEFAULT_CREATED_AT);

    // Corrupt the signature
    if let Some(ref mut signed_event) = bundle.signed_event {
        signed_event.signature[0] ^= 0xFF;
    }

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await;

    assert!(
        response.is_err(),
        "expected put_events to reject invalid signature"
    );
    let status = response.unwrap_err();
    assert_eq!(status.code(), tonic::Code::Unauthenticated);
}

/// Sets up a full identity delegation: create identity with key_a, issue to
/// key_b, key_b claims.  Returns the serialized identity bytes.
async fn setup_identity_with_delegate(
    client: &mut integration_tests::proto::event_sync_service_client::EventSyncServiceClient<
        tonic::transport::Channel,
    >,
    key_a: &ed25519_dalek::SigningKey,
    key_b: &ed25519_dalek::SigningKey,
    base_time: u64,
) -> Vec<u8> {
    let identity_bytes = make_identity_bytes(key_a, 1);

    // 1. key_a creates the identity
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_identity_create_bundle(
                1,
                key_a,
                &identity_bytes,
                base_time,
            )],
        })
        .await
        .expect("identity create failed");

    // 2. key_a issues permissions to key_b
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_identity_issue_bundle(
                2,
                key_a,
                &identity_bytes,
                key_b,
                base_time + HOUR,
            )],
        })
        .await
        .expect("identity issue failed");

    // 3. key_b claims the identity
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_identity_claim_bundle(
                1,
                key_b,
                &identity_bytes,
                base_time + 2 * HOUR,
            )],
        })
        .await
        .expect("identity claim failed");

    identity_bytes
}

#[tokio::test]
async fn test_list_events_by_identity_includes_delegated_key() {
    let mut client = connect_event_sync().await;
    let key_a = generate_signing_key();
    let key_b = generate_signing_key();

    let base_time = DEFAULT_CREATED_AT;
    let identity_bytes =
        setup_identity_with_delegate(&mut client, &key_a, &key_b, base_time).await;

    // key_b posts under the identity
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_post_bundle(
                2,
                &key_b,
                "Post from delegated key",
                base_time + 3 * HOUR,
            )],
        })
        .await
        .expect("post from key_b failed");

    // List by identity — should include events from both key_a and key_b
    let response = client
        .list_events(ListEventsRequest {
            limit: Some(100),
            identity: Some(identity_bytes),
            ..Default::default()
        })
        .await
        .expect("list_events by identity failed");

    let bundles = response.into_inner().event_bundles;
    assert!(
        bundles.len() >= 4,
        "expected at least 4 events (create + issue + claim + post), got {}",
        bundles.len()
    );
}

#[tokio::test]
async fn test_revoked_key_events_excluded_after_revocation() {
    let mut client = connect_event_sync().await;
    let key_a = generate_signing_key();
    let key_b = generate_signing_key();

    let base_time = DEFAULT_CREATED_AT;
    let identity_bytes =
        setup_identity_with_delegate(&mut client, &key_a, &key_b, base_time).await;

    // key_b posts before revocation
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_post_bundle(
                2,
                &key_b,
                "Before revocation",
                base_time + 3 * HOUR,
            )],
        })
        .await
        .expect("pre-revocation post failed");

    // Count events before revocation
    let pre_count = client
        .list_events(ListEventsRequest {
            limit: Some(200),
            identity: Some(identity_bytes.clone()),
            ..Default::default()
        })
        .await
        .expect("list pre-revocation failed")
        .into_inner()
        .event_bundles
        .len();

    // key_a revokes key_b at base + 4h
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_identity_revoke_bundle(
                3,
                &key_a,
                &identity_bytes,
                &key_b,
                base_time + 4 * HOUR,
            )],
        })
        .await
        .expect("revoke failed");

    // key_b posts after revocation (base + 5h, after the revoke at base + 4h)
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_post_bundle(
                3,
                &key_b,
                "After revocation",
                base_time + 5 * HOUR,
            )],
        })
        .await
        .expect("post-revocation post failed");

    // List by identity — post-revocation events from key_b should be excluded
    let response = client
        .list_events(ListEventsRequest {
            limit: Some(200),
            identity: Some(identity_bytes),
            ..Default::default()
        })
        .await
        .expect("list post-revocation failed");

    let post_count = response.into_inner().event_bundles.len();

    // The revoke event itself is signed by key_a (still authorized), so it
    // should appear.  But the post-revocation post from key_b should NOT.
    // So post_count should be pre_count + 1 (the revoke event only).
    assert_eq!(
        post_count,
        pre_count + 1,
        "expected exactly one new event (the revoke) after revocation, \
         but got {} new events (pre={pre_count}, post={post_count})",
        post_count as i64 - pre_count as i64,
    );
}

#[tokio::test]
async fn test_revoked_key_pre_revocation_events_still_visible() {
    let mut client = connect_event_sync().await;
    let key_a = generate_signing_key();
    let key_b = generate_signing_key();

    let base_time = DEFAULT_CREATED_AT;
    let identity_bytes =
        setup_identity_with_delegate(&mut client, &key_a, &key_b, base_time).await;

    // key_b posts before revocation
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_post_bundle(
                2,
                &key_b,
                "This should remain visible",
                base_time + 3 * HOUR,
            )],
        })
        .await
        .expect("pre-revocation post failed");

    // key_a revokes key_b at base + 4h
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![make_identity_revoke_bundle(
                3,
                &key_a,
                &identity_bytes,
                &key_b,
                base_time + 4 * HOUR,
            )],
        })
        .await
        .expect("revoke failed");

    // List by identity — pre-revocation post from key_b should still be there
    let response = client
        .list_events(ListEventsRequest {
            limit: Some(200),
            identity: Some(identity_bytes),
            ..Default::default()
        })
        .await
        .expect("list after revocation failed");

    let bundles = response.into_inner().event_bundles;
    // Should have: create + issue + claim + post + revoke = 5
    assert!(
        bundles.len() >= 5,
        "expected at least 5 events (pre-revocation post should remain), got {}",
        bundles.len()
    );
}
