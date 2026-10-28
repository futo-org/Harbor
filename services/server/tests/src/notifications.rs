//! Mention notifications end to end: a post mentioning identities notifies
//! them, except the reply target, which gets its Reply only.
//! Needs the `workers` process running.

use crate::*;
use polycentric_common::models::protos_v2::notification_service_client::NotificationServiceClient;
use std::time::{Duration, Instant};

const NOTIFICATION_TIMEOUT: Duration = Duration::from_secs(5);

#[tokio::test]
async fn mentions_notify_identities_and_skip_the_reply_target() {
    let mut parent_author = TestClient::new().await;
    parent_author.post_text("parent", current_timestamp());
    let parent_key = parent_author.get_last_event_key();
    parent_author.submit_events().await;

    let mut curly_mentioned = TestClient::new().await;
    curly_mentioned.submit_events().await;
    let mut bare_mentioned = TestClient::new().await;
    bare_mentioned.submit_events().await;

    let mut author = TestClient::new().await;
    author.reply(
        parent_key,
        &format!(
            "hi @{} @{{{},someone@example.com}} @{{{}}}",
            bare_mentioned.identity(),
            curly_mentioned.identity(),
            parent_author.identity(),
        ),
        current_timestamp() + 1,
    );
    author.submit_events().await;

    let author_identity = author.identity().to_owned();
    assert_eq!(
        wait_for_notifications(bare_mentioned.identity(), 1).await,
        vec![(NotificationKind::Mention, author_identity.clone())],
        "bare identity mention gets one Mention"
    );
    assert_eq!(
        wait_for_notifications(curly_mentioned.identity(), 1).await,
        vec![(NotificationKind::Mention, author_identity.clone())],
        "curly identity mention gets one Mention"
    );
    assert_eq!(
        wait_for_notifications(parent_author.identity(), 1).await,
        vec![(NotificationKind::Reply, author_identity)],
        "reply parent that is also mentioned gets one Reply, no Mention"
    );
}

/// `(kind, author identity)` of each notification addressed to `identity`,
/// polled until at least `expected_count` arrive or the timeout passes.
async fn wait_for_notifications(
    identity: &str,
    expected_count: usize,
) -> Vec<(NotificationKind, String)> {
    let mut client = NotificationServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    let deadline = Instant::now() + NOTIFICATION_TIMEOUT;
    loop {
        let notifications = client
            .list_notifications(ListNotificationsRequest {
                identity: identity.to_owned(),
                first: None,
                after: None,
                omit_labels: vec![],
            })
            .await
            .expect("list_notifications failed")
            .into_inner()
            .notifications;
        if notifications.len() >= expected_count || Instant::now() > deadline {
            return notifications
                .iter()
                .map(|n| {
                    let signed = n
                        .trigger_event
                        .as_ref()
                        .and_then(|b| b.signed_event.as_ref())
                        .expect("trigger event missing");
                    let event = Event::decode(&*signed.event_bytes).unwrap();
                    (n.kind.try_into().unwrap(), event.key.unwrap().identity)
                })
                .collect();
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

/// The unread count stream starts at the current count, rises when the
/// workers insert a notification, and drops to zero on acknowledge from
/// another connection. Needs the `workers` process running.
#[tokio::test]
async fn unread_count_stream_follows_new_notifications_and_acknowledge() {
    let mut recipient = TestClient::new().await;
    recipient.submit_events().await;
    let auth_token = recipient.create_auth_token();

    let mut subscriber = NotificationServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    let mut request =
        tonic::Request::new(SubscribeUnreadNotificationCountRequest {});
    request
        .metadata_mut()
        .insert("authorization", auth_token.clone().try_into().unwrap());
    let response = subscriber
        .subscribe_unread_notification_count(request)
        .await
        .expect("subscribe failed");
    assert_eq!(
        response.metadata().get("cache-control").unwrap(),
        "no-transform",
        "proxies must not compress the stream"
    );
    let mut stream = response.into_inner();

    assert_eq!(
        next_count(&mut stream).await,
        0,
        "a new identity has nothing unread"
    );

    let mut follower = TestClient::new().await;
    follower
        .follow_identity(recipient.identity().to_owned(), current_timestamp());
    let follow_key = follower.get_last_event_key();
    follower.submit_events().await;

    assert_eq!(
        next_count(&mut stream).await,
        1,
        "the follow is pushed to the open stream"
    );

    let mut acknowledger = NotificationServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    let mut request = tonic::Request::new(AcknowledgeNotificationsRequest {
        last_seen: Some(follow_key),
    });
    request
        .metadata_mut()
        .insert("authorization", auth_token.try_into().unwrap());
    acknowledger
        .acknowledge_notifications(request)
        .await
        .expect("acknowledge failed");

    assert_eq!(
        next_count(&mut stream).await,
        0,
        "acknowledging clears the count"
    );
}

#[tokio::test]
async fn unread_count_stream_rejects_unauthenticated() {
    let mut client = NotificationServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    let result = client
        .subscribe_unread_notification_count(
            SubscribeUnreadNotificationCountRequest {},
        )
        .await;
    match result {
        Err(status) => assert_eq!(status.code(), tonic::Code::Unauthenticated),
        Ok(_) => panic!("unauthenticated subscribe must fail"),
    }
}

/// Next count from the stream, or a panic after `NOTIFICATION_TIMEOUT`.
async fn next_count(
    stream: &mut tonic::Streaming<SubscribeUnreadNotificationCountResponse>,
) -> u32 {
    tokio::time::timeout(NOTIFICATION_TIMEOUT, stream.message())
        .await
        .expect("no count within the timeout")
        .expect("stream failed")
        .expect("stream ended")
        .count
}
