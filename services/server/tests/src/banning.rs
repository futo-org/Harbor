//! Tests for banned identities.

use std::sync::Once;
use std::time::Duration;

use tokio::time::sleep;

use crate::blobs::{get_blob, random_image, test_blob_upload};
use crate::calendar::{counts, get_event, list_attendees};
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
        .put_events(as_identity(
            &client.identity,
            &client.key,
            PutEventsRequest {
                event_bundles: event_bundles.clone(),
            },
        ))
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
        .put_events(as_identity(
            &client.identity,
            &client.key,
            PutEventsRequest {
                event_bundles: event_bundles.clone(),
            },
        ))
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
#[ignore = "fails on the CI"]
async fn banning_removes_posts_with_images() {
    let (banned_post_image, banned_post_image_bytes) = random_image();
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
    test_blob_upload(&banned_post_image_blob, &banned_post_image_bytes).await;
    let banned_identity = banned_client.identity().to_owned();

    set_ban_status(&banned_identity, true).await;
    prune_blob(&[banned_post_image_blob]).await;
}

#[tokio::test]
#[ignore = "fails on the CI"]
async fn banning_removes_verification_claims_with_images() {
    let (banned_verification_image, banned_verification_image_bytes) =
        random_image();
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
        &banned_verification_image_bytes,
    )
    .await;
    let banned_identity = banned_client.identity().to_owned();

    set_ban_status(&banned_identity, true).await;
    prune_blob(&[banned_verification_image_blob]).await;
}

#[tokio::test]
#[ignore = "fails on the CI"]
async fn banning_removes_profile_updates_with_avatars_and_banners() {
    let (banned_avatar_image, banned_avatar) = random_image();
    let banned_avatar_blob = banned_avatar_image.blob.clone().unwrap();
    let (banned_banner_image, banned_banner) = random_image();
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
    test_blob_upload(&banned_avatar_blob, &banned_avatar).await;
    test_blob_upload(&banned_banner_blob, &banned_banner).await;
    let banned_identity = banned_client.identity().to_owned();

    set_ban_status(&banned_identity, true).await;
    prune_blob(&[banned_avatar_blob, banned_banner_blob]).await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name,
            sort_by: None,
            page_params: None,
        },
        Vec::new(),
    )
    .await;
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

#[tokio::test]
async fn banning_removes_calendar_events_and_rsvps() {
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

    // A banned attendee no longer counts
    set_ban_status(attendee.identity(), true).await;
    let event = get_event(&event_key).await.unwrap();
    assert_eq!(counts(&event), (0, 0, 0));
    assert_eq!(list_attendees(&event_key, None).await, Vec::<String>::new());

    // A banned host takes their events with them
    set_ban_status(host.identity(), true).await;
    let error = get_event(&event_key).await.unwrap_err();
    assert_eq!(error.code(), tonic::Code::NotFound);
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

async fn prune_blob(blobs: &[Blob]) {
    // Build the admin CLI tool once and use the created binary below.
    static BUILD: Once = Once::new();
    BUILD.call_once(|| {
        std::process::Command::new("cargo")
            .args(["build", "--quiet", "--bin", "server"])
            .current_dir("..")
            .status()
            .expect("failed to build server");
    });

    let mut output;
    let mut i = 0;
    loop {
        i += 1;

        let mut blob_exists = false;
        for blob in blobs {
            if get_blob(blob).await.is_some() {
                blob_exists = true;
                break;
            }
        }
        if !blob_exists {
            // Another prune call already removed the blob(s).
            return;
        }

        output = tokio::process::Command::new("../../target/debug/server")
            .args(["prune-blobs", "--grace-period-secs", "0"])
            .current_dir("..")
            .stdin(std::process::Stdio::null())
            .output()
            .await
            .expect("failed to prune blobs via admin CLI");

        if String::from_utf8_lossy(&output.stdout).contains("skip") {
            // If we skipped the pruning (e.g. when another process is holding
            // the lock) we need to try again to ensure the blob(s) the caller
            // cares about are pruned.
            sleep(Duration::from_millis(50)).await;
            continue;
        }

        if output.status.success() {
            for blob in blobs {
                if get_blob(blob).await.is_some() {
                    panic!("blob still existing after pruning {blob:?}");
                }
            }

            return;
        }

        if i >= 3 {
            break;
        }
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
