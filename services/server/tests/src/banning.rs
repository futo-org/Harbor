//! Tests for banned identities.

use crate::*;

#[tokio::test]
async fn ban_after_identity_creation() {
    let mut client = TestClient::new().await;
    client.submit_events().await;

    set_ban_status(client.identity(), true).await;

    client.post_text("Test", 0);

    let event_bundles = take(&mut client.pending);
    let response = client
        .event_sync_client
        .put_events(PutEventsRequest {
            event_bundles: event_bundles.clone(),
        })
        .await
        .expect("put_events failed")
        .into_inner();

    assert!(response.errors.len() == 1);
    assert!(response.errors[0].message.contains("The caller does not have permission to execute the specified operation: identity is banned on this server"));
}

#[tokio::test]
async fn ban_before_identity_creation() {
    let mut client = TestClient::new().await;

    set_ban_status(client.identity(), true).await;

    let event_bundles = take(&mut client.pending);
    let response = client
        .event_sync_client
        .put_events(PutEventsRequest {
            event_bundles: event_bundles.clone(),
        })
        .await
        .expect("put_events failed")
        .into_inner();

    assert!(response.errors.len() == 1);
    assert!(response.errors[0].message.contains("The caller does not have permission to execute the specified operation: identity is banned on this server"));
}

#[tokio::test]
async fn banning_removes_follows() {
    let mut not_banned_client = TestClient::new().await;
    not_banned_client.submit_events().await;
    let not_banned_identity = not_banned_client.identity();

    let mut banned_client = TestClient::new().await;
    banned_client.follow_identity(not_banned_identity.to_owned(), 0);
    banned_client.submit_events().await;
    let banned_identity = banned_client.identity();

    let mut graph_service = graph_service().await;
    let response = graph_service
        .list_followers(ListFollowersRequest {
            identity: not_banned_identity.to_owned(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert!(response.event_bundles.len() == 1);

    let response = graph_service
        .list_following(ListFollowingRequest {
            identity: banned_identity.to_owned(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert!(response.event_bundles.len() == 1);

    set_ban_status(banned_identity, true).await;

    let response = graph_service
        .list_followers(ListFollowersRequest {
            identity: not_banned_identity.to_owned(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert!(response.event_bundles.is_empty());

    let response = graph_service
        .list_following(ListFollowingRequest {
            identity: banned_identity.to_owned(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert!(response.event_bundles.is_empty());
}

#[tokio::test]
async fn banning_removes_posts() {
    let mut banned_client = TestClient::new().await;
    banned_client.post_text("Hello", 0);
    banned_client.submit_events().await;
    let banned_identity = banned_client.identity();

    let mut not_banned_client = TestClient::new().await;
    not_banned_client.follow_identity(banned_identity.to_owned(), 0);
    not_banned_client.submit_events().await;
    let not_banned_identity = not_banned_client.identity();

    let mut feeds = connect_feeds().await;
    let request = GetFollowingFeedRequest {
        follower_identity: not_banned_identity.to_owned(),
        page_params: None,
        omit_labels: Vec::new(),
        sort_by: Some(SortPostsBy::Top.into()),
    };
    let response = feeds
        .get_recommended_feed(request.clone())
        .await
        .unwrap()
        .into_inner();
    assert!(response.event_bundles.len() == 1);

    set_ban_status(banned_identity, true).await;

    let response = feeds
        .get_recommended_feed(request.clone())
        .await
        .unwrap()
        .into_inner();
    assert!(response.event_bundles.is_empty());
}

#[tokio::test]
async fn banning_removes_reactions() {
    let mut banned_client = TestClient::new().await;

    let mut not_banned_client = TestClient::new().await;
    not_banned_client.post_text("Hello", 0);
    let post_key = not_banned_client.get_last_event_key();
    not_banned_client.follow_identity(banned_client.identity().to_owned(), 0);
    not_banned_client.submit_events().await;
    let not_banned_identity = not_banned_client.identity();

    banned_client.thumbs_up(post_key, 0);
    banned_client.submit_events().await;
    let banned_identity = banned_client.identity();

    let mut feeds = connect_feeds().await;
    let request = GetIdentityFeedRequest {
        identity: not_banned_identity.to_owned(),
        page_params: None,
        omit_labels: Vec::new(),
    };
    let response = feeds
        .get_identity_feed(request.clone())
        .await
        .unwrap()
        .into_inner();
    assert_eq!(response.event_bundles.len(), 1);
    assert_eq!(
        response.event_bundles[0]
            .meta
            .as_ref()
            .unwrap()
            .reaction_count,
        Some(1)
    );

    set_ban_status(banned_identity, true).await;

    let response = feeds
        .get_identity_feed(request.clone())
        .await
        .unwrap()
        .into_inner();
    dbg!(&response.event_bundles);
    assert_eq!(response.event_bundles.len(), 1);
    assert_eq!(
        response.event_bundles[0]
            .meta
            .as_ref()
            .unwrap()
            .reaction_count,
        Some(0)
    );
}

// TODO: add more tests:
// repost
// quote
// reply
// profile
// block
// notifications?
// attributed_to_reaction
// pairing session ?
// pairing session claimer?

async fn set_ban_status(identity: &str, banned: bool) {
    let (mut moderator, guard) = TestClient::trusted_moderator().await;
    moderator.submit_events().await;
    drop(guard);
    let auth_token = moderator.create_auth_token();

    let mut request = tonic::Request::new(SetBanStatusRequest {
        target_identity: identity.to_owned(),
        banned,
    });
    request
        .metadata_mut()
        .insert("authorization", auth_token.try_into().unwrap());

    identity_service()
        .await
        .set_ban_status(request)
        .await
        .unwrap();
}
