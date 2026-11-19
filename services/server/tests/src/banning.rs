//! Tests for banned identities.

use crate::blobs::{
    banned_avatar, banned_banner, banned_post, banned_verification, get_blob,
    test_blob_upload,
};
use crate::search_users::expect_searched_users;
use crate::*;

#[tokio::test]
async fn ban_after_identity_creation() {
    let mut client = TestClient::new().await;
    client.submit_events().await;

    set_ban_status(client.identity(), true).await;

    client.post_text("Test", current_timestamp());

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
    banned_client
        .follow_identity(not_banned_identity.to_owned(), current_timestamp());
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
    banned_client.post_text("Hello", current_timestamp());
    banned_client.submit_events().await;
    let banned_identity = banned_client.identity();

    let mut not_banned_client = TestClient::new().await;
    not_banned_client
        .follow_identity(banned_identity.to_owned(), current_timestamp());
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
async fn banning_removes_posts_with_images() {
    let (banned_post_image, banned_post_image_bytes) = banned_post();
    let banned_post_image_blob = banned_post_image.blob.clone().unwrap();

    let mut banned_client = TestClient::new().await;
    let post = Post {
        text: "Hello, World!".to_owned(),
        images: vec![ImageSet {
            images: vec![banned_post_image],
        }],
        ..Default::default()
    };
    banned_client.post(post, current_timestamp());
    banned_client.submit_events().await;
    test_blob_upload(&banned_post_image_blob, banned_post_image_bytes).await;
    let banned_identity = banned_client.identity().to_owned();

    set_ban_status(&banned_identity, true).await;
    prune_blob().await;

    // Blob should be removed.
    assert!(get_blob(&banned_post_image_blob).await.is_none());
}

#[tokio::test]
async fn banning_removes_verification_claims_with_images() {
    let (banned_verification_image, banned_verification_image_bytes) =
        banned_verification();
    let banned_verification_image_blob =
        banned_verification_image.blob.clone().unwrap();

    let mut banned_client = TestClient::new().await;
    let mut claim = github_verification_claim("test");
    claim.images = vec![ImageSet {
        images: vec![banned_verification_image],
    }];
    banned_client.verification_claim(claim, current_timestamp());
    banned_client.submit_events().await;
    test_blob_upload(
        &banned_verification_image_blob,
        banned_verification_image_bytes,
    )
    .await;
    let banned_identity = banned_client.identity().to_owned();

    set_ban_status(&banned_identity, true).await;
    prune_blob().await;

    // Blob should be removed.
    assert!(get_blob(&banned_verification_image_blob).await.is_none());
}

#[tokio::test]
async fn banning_removes_profile_updates_with_avatars_and_banners() {
    let (banned_avatar_image, banned_avatar) = banned_avatar();
    let banned_avatar_blob = banned_avatar_image.blob.clone().unwrap();
    let (banned_banner_image, banned_banner) = banned_banner();
    let banned_banner_blob = banned_banner_image.blob.clone().unwrap();

    let mut banned_client = TestClient::new().await;
    let profile_name = "Bad Bot".to_owned();
    let profile_update = ProfileUpdate {
        name: Some(profile_name.clone()),
        avatar: Some(ImageSet {
            images: vec![banned_avatar_image],
        }),
        banner: Some(ImageSet {
            images: vec![banned_banner_image],
        }),
        description: None,
        alias: None,
    };
    banned_client.profile_update(profile_update, current_timestamp());
    banned_client.submit_events().await;
    test_blob_upload(&banned_avatar_blob, banned_avatar).await;
    test_blob_upload(&banned_banner_blob, banned_banner).await;
    let banned_identity = banned_client.identity().to_owned();

    set_ban_status(&banned_identity, true).await;
    prune_blob().await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name,
            sort_by: None,
            page_params: None,
        },
        Vec::new(),
    )
    .await;

    // Blob should be removed.
    assert!(get_blob(&banned_avatar_blob).await.is_none());
    assert!(get_blob(&banned_banner_blob).await.is_none());
}

#[tokio::test]
async fn banning_removes_reactions() {
    let mut banned_client = TestClient::new().await;

    let mut not_banned_client = TestClient::new().await;
    not_banned_client.post_text("Hello", current_timestamp());
    let post_key = not_banned_client.get_last_event_key();
    not_banned_client.follow_identity(
        banned_client.identity().to_owned(),
        current_timestamp(),
    );
    not_banned_client.submit_events().await;
    let not_banned_identity = not_banned_client.identity();

    banned_client.thumbs_up(post_key, current_timestamp());
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

    if banned {
        let response = moderator
            .event_sync_client()
            .list_events(ListEventsRequest {
                size: Some(1),
                filters: Some(ListEventsFilters {
                    identity: identity.to_owned(),
                    ..Default::default()
                }),
            })
            .await
            .expect("list_events failed")
            .into_inner();
        assert!(
            response.event_bundles.is_empty()
                && response.event_hints.is_empty()
        );
    }
}

async fn prune_blob() {
    let output = tokio::process::Command::new("cargo")
        .args([
            "run",
            "--quiet",
            "--bin",
            "server",
            "--",
            "prune-blobs",
            "--grace-period-secs",
            "0",
        ])
        .current_dir("..")
        .output()
        .await
        .expect("failed to prune blobs via admin CLI");

    if output.status.success() {
        return;
    }

    use std::io::Write;
    let stdout = std::io::stdout();
    let mut stdout = stdout.lock();
    let stderr = std::io::stderr();
    let mut stderr = stderr.lock();
    _ = stdout.write_all(&output.stdout);
    _ = stderr.write_all(&output.stderr);
    panic!("running prune blob admin CLI failed");
}
