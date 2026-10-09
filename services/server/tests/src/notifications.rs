//! Mention notifications end to end: a post mentioning identities notifies
//! them, except the reply target, which gets its Reply only. Alias mentions
//! resolve through `<domain>/.well-known/polycentric.json`, which this test
//! serves from a local mock server, so the workers must be started with
//! `HARBOR_ALIAS_TEST_ORIGIN=http://localhost:3999`.
//! Needs the `workers` process running.

use crate::*;
use polycentric_common::models::protos_v2::notification_service_client::NotificationServiceClient;
use std::time::{Duration, Instant};

const NOTIFICATION_TIMEOUT: Duration = Duration::from_secs(60);

/// Where the workers fetch the alias document from. One test
/// owns this port; a second alias test would have to share its server.
const ALIAS_MOCK_PORT: u16 = 3999;

#[tokio::test]
async fn mentions_notify_identities_and_aliases_and_skip_the_reply_target() {
    let mut alias_mentioned = TestClient::new().await;
    alias_mentioned.submit_events().await;
    let alias_local = random_string().to_lowercase();
    let mut alias_server =
        mockito::Server::new_with_opts_async(mockito::ServerOpts {
            host: "0.0.0.0",
            port: ALIAS_MOCK_PORT,
            ..Default::default()
        })
        .await;
    let alias_document = alias_server
        .mock("GET", "/.well-known/polycentric.json")
        .expect(1)
        .with_body(format!(
            r#"{{"names":{{"{alias_local}":"{}"}}}}"#,
            alias_mentioned.identity()
        ))
        .create_async()
        .await;

    let mut parent_author = TestClient::new().await;
    parent_author.post_text("parent", DEFAULT_CREATED_AT);
    let parent_key = parent_author.get_last_event_key();
    parent_author.submit_events().await;

    let mut curly_mentioned = TestClient::new().await;
    curly_mentioned.submit_events().await;
    let mut bare_mentioned = TestClient::new().await;
    bare_mentioned.submit_events().await;

    // Mixed case: alias lookup is case-insensitive. The unlisted alias at the
    // same domain shares the one fetch and resolves to nobody.
    let unlisted_alias_local = random_string().to_lowercase();
    let mut author = TestClient::new().await;
    author.reply(
        parent_key,
        &format!(
            "hi @{}@EXAMPLE.COM @{}@example.com @{} @{{{},Someone}} @{{{}}}",
            alias_local.to_uppercase(),
            unlisted_alias_local,
            bare_mentioned.identity(),
            curly_mentioned.identity(),
            parent_author.identity(),
        ),
        DEFAULT_CREATED_AT + HOUR,
    );
    author.submit_events().await;

    let author_identity = author.identity().to_owned();
    assert_eq!(
        wait_for_notifications(alias_mentioned.identity(), 1).await,
        vec![(NotificationKind::Mention, author_identity.clone())],
        "alias mention gets one Mention"
    );
    alias_document.assert_async().await;
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
        vec![(NotificationKind::Reply, author_identity.clone())],
        "reply parent that is also mentioned gets one Reply, no Mention"
    );

    // Both outcomes are now cached: mentioning the same aliases again
    // notifies from the cache without another fetch (the mock still expects
    // exactly one hit).
    let mut second_author = TestClient::new().await;
    second_author.post_text(
        &format!("again @{alias_local}@example.com @{unlisted_alias_local}@example.com"),
        DEFAULT_CREATED_AT + 2 * HOUR,
    );
    second_author.submit_events().await;

    let mut mention_authors: Vec<(NotificationKind, String)> =
        wait_for_notifications(alias_mentioned.identity(), 2).await;
    mention_authors.sort();
    let mut expected_mention_authors = vec![
        (NotificationKind::Mention, author_identity),
        (
            NotificationKind::Mention,
            second_author.identity().to_owned(),
        ),
    ];
    expected_mention_authors.sort();
    assert_eq!(
        mention_authors, expected_mention_authors,
        "second alias mention is served from the cache"
    );
    alias_document.assert_async().await;
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
    let mut stream = subscriber
        .subscribe_unread_notification_count(request)
        .await
        .expect("subscribe failed")
        .into_inner();

    assert_eq!(
        next_count(&mut stream).await,
        0,
        "a new identity has nothing unread"
    );

    let mut follower = TestClient::new().await;
    follower
        .follow_identity(recipient.identity().to_owned(), DEFAULT_CREATED_AT);
    follower.submit_events().await;

    assert_eq!(
        next_count(&mut stream).await,
        1,
        "the follow is pushed to the open stream"
    );

    let mut acknowledger = NotificationServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server");
    let mut request = tonic::Request::new(AcknowledgeNotificationsRequest {});
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
