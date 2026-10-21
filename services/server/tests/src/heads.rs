//! `SubscribeHeads` tests. Need Valkey.

use crate::*;
use std::time::Duration;

const HEADS_TIMEOUT: Duration = Duration::from_secs(10);

/// Heads move when another connection of the identity stores an event.
#[tokio::test]
async fn heads_stream_follows_events_from_another_device() {
    let mut device = TestClient::new().await;
    device.submit_events().await;

    let mut subscriber = EventSyncServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    let mut request = tonic::Request::new(SubscribeHeadsRequest {});
    request.metadata_mut().insert(
        "authorization",
        device.create_auth_token().try_into().unwrap(),
    );
    let response = subscriber
        .subscribe_heads(request)
        .await
        .expect("subscribe failed");
    assert_eq!(
        response.metadata().get("cache-control").unwrap(),
        "no-transform",
        "proxies must not compress the stream"
    );
    let mut stream = response.into_inner();

    let initial = next_heads(&mut stream).await;
    assert!(!initial.is_empty(), "the identity event is a head");

    device.post_text("from another device", current_timestamp() + 1);
    let post = device.get_last_event_key();
    device.submit_events().await;

    let heads = next_heads(&mut stream).await;
    assert!(heads.contains(&post), "the new post is pushed as a head");
    for head in &initial {
        assert!(heads.contains(head), "other heads are kept");
    }
}

#[tokio::test]
async fn heads_stream_rejects_unauthenticated() {
    let mut client = EventSyncServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    match client.subscribe_heads(SubscribeHeadsRequest {}).await {
        Err(status) => assert_eq!(status.code(), tonic::Code::Unauthenticated),
        Ok(_) => panic!("unauthenticated subscribe must fail"),
    }
}

/// Next heads from the stream, or a panic after `HEADS_TIMEOUT`.
async fn next_heads(
    stream: &mut tonic::Streaming<ListHeadsResponse>,
) -> Vec<EventKey> {
    tokio::time::timeout(HEADS_TIMEOUT, stream.message())
        .await
        .expect("no heads within the timeout")
        .expect("stream failed")
        .expect("stream ended")
        .heads
}
