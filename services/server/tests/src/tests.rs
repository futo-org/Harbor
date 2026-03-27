use integration_tests::proto::{ListEventsRequest, PutEventsRequest};
use integration_tests::{connect_event_sync, generate_signing_key, make_post_bundle};

#[tokio::test]
async fn test_list_events_empty() {
    let mut client = connect_event_sync().await;

    let response = client
        .list_events(ListEventsRequest { limit: Some(10) })
        .await
        .expect("list_events failed");

    let bundles = response.into_inner().event_bundles;
    // May not be empty if other tests ran first, just verify the call succeeds
    println!("list_events returned {} bundles", bundles.len());
}

#[tokio::test]
async fn test_put_single_event() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();

    let bundle = make_post_bundle("test-stream-single", 1, &key, "Hello, polycentric!");

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await;

    assert!(
        response.is_ok(),
        "put_events failed: {:?}",
        response.err()
    );
}

#[tokio::test]
async fn test_put_then_list_events() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();

    let bundle = make_post_bundle("test-stream-list", 1, &key, "A test post");

    client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("put_events failed");

    let response = client
        .list_events(ListEventsRequest { limit: Some(100) })
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
        .map(|i| make_post_bundle("test-stream-multi", i, &key, &format!("Post #{i}")))
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

    let mut bundle = make_post_bundle("test-stream-bad-sig", 1, &key, "Bad signature test");

    // Corrupt the signature
    if let Some(ref mut signed_event) = bundle.signed_event {
        signed_event.signature[0] ^= 0xFF;
    }

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await;

    assert!(response.is_err(), "expected put_events to reject invalid signature");
    let status = response.unwrap_err();
    assert_eq!(status.code(), tonic::Code::Unauthenticated);
}
