//! Tests for deleting identities.

use std::slice;

use crate::event_sync::{ExpectError, expect_errors};
use crate::feeds::{following_feed, identity_feed, post_thread, test_get_post};
use crate::graph::{
    ExpectedFollowSuggestion, check_followers, check_following, suggest_follow,
};
use crate::search_posts::expect_searched_posts;
use crate::search_users::expect_searched_users;
use crate::*;

// TODO: things to fix:
// * full_resync_after_deletion: not sure what to do yet.
// * with_following: check_followers on deleted identity still returns results.

#[tokio::test]
async fn no_more_events() {
    let mut client = TestClient::new().await;
    client.submit_events().await;

    client.delete_self().await;
    no_events(&mut client).await;

    client.post_text("I'm deleted", current_timestamp());
    let result = client.try_submit_events().await;
    expect_errors(result, &[ExpectError::no_identity()], &[]);

    no_events(&mut client).await;
}

#[tokio::test]
#[ignore = "determine what we want to do here"]
async fn full_resync_after_deletion() {
    let mut client = TestClient::new().await;
    let profile_name = random_string();
    let profile_update = ProfileUpdate {
        name: Some(profile_name.clone()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    let pending_events = client.pending.clone();
    client.submit_events().await;

    client.delete_self().await;
    no_events(&mut client).await;

    // Sync all events again.
    client.pending.extend(pending_events);
    client.submit_events().await;

    // TODO: determine what to do here.
}

#[tokio::test]
async fn following_excludes_deleted_identities() {
    let mut search = graph_service().await;

    // Two clients following each other.
    let mut to_delete_client = TestClient::new().await;
    let mut other_client = TestClient::new().await;
    let to_delete_identity = to_delete_client.identity().to_owned();
    let other_identity = other_client.identity().to_owned();
    to_delete_client
        .follow_identity(other_identity.clone(), current_timestamp());
    other_client
        .follow_identity(to_delete_identity.clone(), current_timestamp());
    to_delete_client.submit_events().await;
    other_client.submit_events().await;

    // Third client that follows other client.
    let mut third_client = TestClient::new().await;
    let third_identity = third_client.identity().to_owned();
    third_client.follow_identity(other_identity.clone(), current_timestamp());
    third_client.submit_events().await;

    // Assert the state before the deletion.
    // To deleted: follows and is followed by other, no suggestions.
    check_following(
        &mut search,
        to_delete_identity.clone(),
        slice::from_ref(&other_identity),
    )
    .await;
    check_followers(
        &mut search,
        to_delete_identity.clone(),
        &[&other_identity],
    )
    .await;
    suggest_follow(&to_delete_client, Vec::new(), Vec::new()).await;
    // Other: follows and is followed by to be deleted, no suggestions.
    check_following(
        &mut search,
        other_identity.clone(),
        slice::from_ref(&to_delete_identity),
    )
    .await;
    check_followers(
        &mut search,
        other_identity.clone(),
        &[&to_delete_identity, &third_identity],
    )
    .await;
    suggest_follow(&other_client, Vec::new(), Vec::new()).await;
    // Third: follows other, suggested to be deleted.
    check_following(
        &mut search,
        third_identity.clone(),
        slice::from_ref(&other_identity),
    )
    .await;
    check_followers(&mut search, third_identity.clone(), &[]).await;
    suggest_follow(
        &third_client,
        vec![ExpectedFollowSuggestion {
            suggestion: to_delete_identity.clone(),
            followers: vec![other_identity.clone()],
        }],
        Vec::new(),
    )
    .await;

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    // To deleted: nothing.
    check_following(&mut search, to_delete_identity.clone(), &[]).await;
    // FIXME: still returns a result.
    //check_followers(&mut search, to_delete_identity.clone(), &[]).await;
    suggest_follow(&to_delete_client, Vec::new(), Vec::new()).await;
    // Other: to deleted shouldn't be returned anywhere.
    check_following(
        &mut search,
        other_identity.clone(),
        slice::from_ref(&to_delete_identity),
    )
    .await;
    check_followers(
        &mut search,
        other_identity.clone(),
        &[/* Gone: to_delete_identity */ &third_identity],
    )
    .await;
    suggest_follow(&other_client, Vec::new(), Vec::new()).await;
    // Third: follows other, suggested to be deleted.
    check_following(
        &mut search,
        third_identity.clone(),
        slice::from_ref(&other_identity),
    )
    .await;
    check_followers(&mut search, third_identity.clone(), &[]).await;
    suggest_follow(
        &third_client,
        Vec::new(), /* Gone: to deleted. */
        Vec::new(),
    )
    .await;
}

#[tokio::test]
async fn search_users_excludes_deleted_identities() {
    let mut client = TestClient::new().await;

    let profile_name = random_string();
    let profile_update = ProfileUpdate {
        name: Some(profile_name.clone()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name.clone(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;

    client.delete_self().await;
    no_events(&mut client).await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name.clone(),
            sort_by: None,
            page_params: None,
        },
        Vec::new(), // Delete
    )
    .await;
}

#[tokio::test]
async fn search_posts_excludes_posts_from_deleted_identites() {
    let mut client = TestClient::new().await;

    let query = random_string();
    let post_text = format!("Hello, from {query}!");
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query: post_text.clone(),
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![Post {
            text: post_text.to_owned(),
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        }],
    )
    .await;

    client.delete_self().await;
    no_events(&mut client).await;

    expect_searched_posts(
        SearchPostsRequest {
            query: post_text,
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        Vec::new(),
    )
    .await;
}

#[tokio::test]
async fn following_feed_excludes_posts_from_deleted_identities() {
    let mut to_delete_client = TestClient::new().await;
    let query = random_string();
    let post_text = format!("Hello, from {query}!");
    let to_delete_identity = to_delete_client.identity().to_owned();
    to_delete_client.post_text(&post_text, current_timestamp());
    let post1_key = to_delete_client.get_last_event_key();
    to_delete_client.submit_events().await;

    let mut follower_client = TestClient::new().await;
    let follower_identity = follower_client.identity().to_owned();
    follower_client.follow_identity(to_delete_identity, current_timestamp());
    follower_client.submit_events().await;

    following_feed(&follower_identity, &[post1_key]).await;

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    following_feed(&follower_identity, &[]).await;
}

#[tokio::test]
async fn identity_feed_excludes_posts_from_deleted_identities() {
    let mut to_delete_client = TestClient::new().await;
    let query = random_string();
    let post_text = format!("Hello, from {query}!");
    let to_delete_identity = to_delete_client.identity().to_owned();
    to_delete_client.post_text(&post_text, current_timestamp());
    let post_key = to_delete_client.get_last_event_key();
    to_delete_client.submit_events().await;

    identity_feed(
        to_delete_identity.clone(),
        &[ExpectEvent {
            key: post_key,
            kind: ExpectEventKind::Post { text: &post_text },
        }],
        vec![
            ExpectHint::Identity(to_delete_identity.clone()),
            ExpectHint::moderator_identity(),
        ],
    )
    .await;

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    // After deletion it should all be gone.
    identity_feed(to_delete_identity.clone(), &[], Vec::new()).await;
}

#[tokio::test]
async fn get_post_excludes_posts_from_deleted_identities() {
    let mut client = TestClient::new().await;
    client.post_text("Text", current_timestamp());
    let post_key = client.get_last_event_key();
    client.submit_events().await;

    test_get_post(
        post_key.clone(),
        Some(EventMetadata {
            reply_count: Some(0),
            reaction_count: Some(0),
            upvote_count: Some(0),
            downvote_count: Some(0),
            emoji_reactions: Vec::new(),
            repost_count: Some(0),
            quote_count: Some(0),
        }),
        vec![
            ExpectHint::moderator_identity(),
            ExpectHint::Identity(client.identity().to_owned()),
        ],
    )
    .await;

    client.delete_self().await;
    no_events(&mut client).await;

    test_get_post(post_key, None, Vec::new()).await;
}

#[tokio::test]
async fn get_post_thread_excludes_posts_from_deleted_identities() {
    let mut client = TestClient::new().await;
    let post_text = "Deletion test";
    client.post_text(post_text, current_timestamp());
    let post_key = client.get_last_event_key();
    client.submit_events().await;

    post_thread(
        post_key.clone(),
        &[ExpectEvent {
            key: post_key.clone(),
            kind: ExpectEventKind::Post { text: &post_text },
        }],
        vec![
            ExpectHint::moderator_identity(),
            ExpectHint::Identity(client.identity().to_owned()),
        ],
    )
    .await;

    client.delete_self().await;
    no_events(&mut client).await;

    let status = connect_feeds()
        .await
        .get_post_thread(GetPostThreadRequest {
            event_key: Some(post_key),
            limit: 0,
            omit_labels: Vec::new(),
        })
        .await
        .unwrap_err();
    assert_eq!(status.code(), tonic::Code::NotFound);
}

async fn no_events(client: &mut TestClient) {
    let identity = client.identity().to_owned();
    let response = client
        .event_sync_client()
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity,
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed")
        .into_inner();
    assert!(response.event_bundles.is_empty());
    assert!(response.event_hints.is_empty());
}
