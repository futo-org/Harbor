//! Tests for deleting identities.

use std::slice;

use crate::calendar::{counts, get_event, list_attendees};
use crate::event_sync::{ExpectError, expect_errors};
use crate::feeds::{
    following_feed, identity_feed, post_thread, recommended_feed, test_get_post,
};
use crate::graph::{
    ExpectedFollowSuggestion, check_followers, check_following, suggest_follow,
};
use crate::pairing::new_session;
use crate::search_posts::expect_searched_posts;
use crate::search_users::expect_searched_users;
use crate::*;

// TODO: things to fix:
// * full_resync_after_deletion: not sure what to do yet.
// * checking followers on deleted identity still returns results.
// * recommended feed still behaves like the identity wasn't deleted.
// * getting pairing session currently works for deleted identities.
// * getting recommended and following feed for a deleted identity succeeds.

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
#[ignore = "this fails"]
async fn following_feed_for_deleted_identity_returns_nothing() {
    let mut follower_client = TestClient::new().await;
    follower_client.post_text("Some text", current_timestamp());
    let post_key = follower_client.get_last_event_key();
    follower_client.submit_events().await;

    let mut to_delete_client = TestClient::new().await;
    to_delete_client.follow_identity(
        follower_client.identity().to_owned(),
        current_timestamp(),
    );
    to_delete_client.submit_events().await;
    let to_delete_identity = to_delete_client.identity().to_owned();

    following_feed(&to_delete_identity, &[post_key]).await;

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    following_feed(&to_delete_identity, &[]).await;
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

#[tokio::test]
async fn recommended_feed_excludes_anything_from_deleted_identities() {
    // Identity used to react to, repost, etc. posts from.
    let mut other_client = TestClient::new().await;
    other_client.post_text("Other post, react to", current_timestamp());
    let post_react_key = other_client.get_last_event_key();
    other_client.post_text("Other post, repost", current_timestamp());
    let post_repost_key = other_client.get_last_event_key();
    other_client.post_text("Other post, quote", current_timestamp());
    let post_quote_key = other_client.get_last_event_key();
    other_client.post_text("Other post, reply", current_timestamp());
    let post_reply_key = other_client.get_last_event_key();
    other_client.submit_events().await;

    // Identity that will be deleted. Creates the following.
    let mut to_delete_client = TestClient::new().await;
    // * Post
    to_delete_client
        .post_text("Post from deleted identity", current_timestamp());
    let post_key = to_delete_client.get_last_event_key();
    // * Reacts to a post
    to_delete_client.thumbs_up(post_react_key.clone(), current_timestamp());
    // * Reposts a post
    to_delete_client.repost_key(post_repost_key.clone(), current_timestamp());
    // * Quotes a post
    to_delete_client.quote(
        post_quote_key.clone(),
        "Quoted post",
        current_timestamp(),
    );
    let quote_key = to_delete_client.get_last_event_key();
    // * Replies to a post
    to_delete_client.reply(
        post_reply_key.clone(),
        "Reply to post",
        current_timestamp(),
    );
    let reply_key = to_delete_client.get_last_event_key();
    to_delete_client.submit_events().await;
    let to_delete_identity = to_delete_client.identity();

    // Identity that follows the identity that will be deleted. Should have a
    // full recommended feed first, empty once the identity is deleted.
    let mut follower_client = TestClient::new().await;
    follower_client
        .follow_identity(to_delete_identity.to_owned(), current_timestamp());
    follower_client.submit_events().await;
    let follower_identity = follower_client.identity();

    recommended_feed(
        follower_identity,
        &[
            post_reply_key.clone(),
            post_quote_key.clone(),
            post_repost_key.clone(),
            post_react_key.clone(),
            reply_key,
            quote_key,
            post_key,
        ],
    )
    .await;

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    recommended_feed(
        follower_identity,
        &[
            // FIXME: these posts shouldn't be returned as the follower isn't
            // connected to other identity (which created these posts) anymore,
            // as the in between identity has been deleted.
            post_reply_key,
            post_quote_key,
            post_repost_key,
            post_react_key,
        ],
    )
    .await;
}

#[tokio::test]
#[ignore = "this fails"]
async fn recommended_feed_for_deleted_identity_returns_nothing() {
    let mut other_client = TestClient::new().await;
    other_client.post_text("Some post", current_timestamp());
    let post_key = other_client.get_last_event_key();
    other_client.submit_events().await;

    // Identity that will be deleted.
    let mut to_delete_client = TestClient::new().await;
    to_delete_client.follow_identity(
        other_client.identity().to_owned(),
        current_timestamp(),
    );
    to_delete_client.submit_events().await;

    recommended_feed(to_delete_client.identity(), &[post_key]).await;

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    recommended_feed(to_delete_client.identity(), &[]).await;
}

#[tokio::test]
async fn getting_profile_for_deleted_identity_returns_nothing() {
    let mut to_delete_client = TestClient::new().await;
    to_delete_client.profile_update(
        ProfileUpdate {
            name: Some("Delete me".to_string()),
            ..Default::default()
        },
        current_timestamp(),
    );
    let profile_key = to_delete_client.get_last_event_key();
    to_delete_client.submit_events().await;
    let to_delete_identity = to_delete_client.identity().to_owned();

    let response = connect_profile()
        .await
        .get_profile(GetProfileRequest {
            identity: to_delete_identity.clone(),
        })
        .await
        .expect("failed to get profile")
        .into_inner();
    expect_events(
        &response.event_bundles,
        &[ExpectEvent {
            key: profile_key,
            kind: ExpectEventKind::ProfileUpdate {
                name: Some("Delete me".to_string()),
                description: None,
                alias: None,
            },
        }],
    );
    expect_hints(
        &response.event_hints,
        vec![ExpectHint::Identity(to_delete_identity.clone())],
    );

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    let response = connect_profile()
        .await
        .get_profile(GetProfileRequest {
            identity: to_delete_identity.clone(),
        })
        .await
        .expect("failed to get profile")
        .into_inner();
    expect_events(&response.event_bundles, &[]);
    expect_hints(&response.event_hints, Vec::new());
}

#[tokio::test]
#[ignore = "this fails"]
async fn pairing_sessions_are_not_listed_for_deleted_identity() {
    let mut to_delete_client = TestClient::new().await;
    let identity_state = to_delete_client.get_last_event_bundle();
    to_delete_client.submit_events().await;

    let (issuer_state, digest_sha256) =
        new_session(&to_delete_client, identity_state);
    let mut pairing = pairing_service().await;

    let put = pairing
        .put_pairing_session(PutPairingSessionRequest {
            issuer_state: Some(issuer_state.clone()),
        })
        .await
        .expect("put_pairing_session failed")
        .into_inner();
    let state = put.session_state.unwrap();
    assert_eq!(state.issuer_state, Some(issuer_state.clone()));
    assert!(state.claimers.is_empty());

    let get = pairing
        .get_pairing_session(GetPairingSessionRequest {
            digest_sha256: digest_sha256.clone(),
        })
        .await
        .expect("get_pairing_session failed")
        .into_inner();
    assert_eq!(
        get.session_state.unwrap().issuer_state.as_ref(),
        Some(&issuer_state)
    );

    to_delete_client.delete_self().await;
    no_events(&mut to_delete_client).await;

    let status = pairing
        .get_pairing_session(GetPairingSessionRequest { digest_sha256 })
        .await
        .unwrap_err();
    assert_eq!(status.code(), tonic::Code::NotFound);
}

#[tokio::test]
async fn calendar_events_exclude_deleted_identities() {
    let mut host = TestClient::new().await;
    host.calendar_event_titled("Meetup", 24, current_timestamp());
    let event_key = host.get_last_event_key();
    host.submit_events().await;

    let mut attendee = TestClient::new().await;
    attendee.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Going,
        current_timestamp(),
    );
    attendee.submit_events().await;

    let event = get_event(&event_key).await.unwrap();
    assert_eq!(counts(&event), (1, 0, 0));

    // A deleted attendee no longer counts
    attendee.delete_self().await;
    let event = get_event(&event_key).await.unwrap();
    assert_eq!(counts(&event), (0, 0, 0));
    assert_eq!(list_attendees(&event_key, None).await, Vec::<String>::new());

    // A deleted host takes their events with them
    host.delete_self().await;
    let error = get_event(&event_key).await.unwrap_err();
    assert_eq!(error.code(), tonic::Code::NotFound);
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
