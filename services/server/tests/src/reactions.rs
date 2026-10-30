//! Tests for reactions.

use tonic::Code;

use crate::*;

#[tokio::test]
async fn attributed_to_reaction() {
    let url = format!("https://harbor.social/{}", random_string());

    let mut client = TestClient::new().await;
    client.thumbs_up_to(&url, current_timestamp());
    client.thumbs_down_to(&url, current_timestamp());
    client.submit_events().await;

    work_around_eventual_consistency();

    let response = client
        .event_sync_client()
        .get_attributed_to_reaction_counts(
            GetAttributedToReactionCountsRequest {
                attributed_to: Some(AttributedTo {
                    to: Some(To::Link(Link {
                        title: String::new(),
                        description: None,
                        image: None,
                        url,
                    })),
                }),
            },
        )
        .await
        .unwrap()
        .into_inner();

    assert_eq!(response.upvote_count, 1);
    assert_eq!(response.downvote_count, 1);
}

#[tokio::test]
async fn attributed_to_reaction_unknown_url() {
    let url = format!("https://harbor.social/{}", random_string());

    let mut client = connect_event_sync().await;

    let response = client
        .get_attributed_to_reaction_counts(
            GetAttributedToReactionCountsRequest {
                attributed_to: Some(AttributedTo {
                    to: Some(To::Link(Link {
                        title: String::new(),
                        description: None,
                        image: None,
                        url,
                    })),
                }),
            },
        )
        .await
        .unwrap()
        .into_inner();

    assert_eq!(response.upvote_count, 0);
    assert_eq!(response.downvote_count, 0);
}

#[tokio::test]
async fn attributed_to_reaction_wrong_usage() {
    let mut client = connect_event_sync().await;

    // Empty url.
    let err = client
        .get_attributed_to_reaction_counts(
            GetAttributedToReactionCountsRequest {
                attributed_to: Some(AttributedTo {
                    to: Some(To::Link(Link {
                        title: String::new(),
                        description: None,
                        image: None,
                        url: String::new(),
                    })),
                }),
            },
        )
        .await
        .unwrap_err();
    assert_eq!(err.code(), Code::InvalidArgument);
    assert_eq!(err.message(), "attributed_to link url is required");

    // No to (in attributed to).
    let err = client
        .get_attributed_to_reaction_counts(
            GetAttributedToReactionCountsRequest {
                attributed_to: Some(AttributedTo { to: None }),
            },
        )
        .await
        .unwrap_err();
    assert_eq!(err.code(), Code::InvalidArgument);
    assert_eq!(err.message(), "attributed_to link url is required");

    // No attributed to.
    let err = client
        .get_attributed_to_reaction_counts(
            GetAttributedToReactionCountsRequest {
                attributed_to: None,
            },
        )
        .await
        .unwrap_err();
    assert_eq!(err.code(), Code::InvalidArgument);
    assert_eq!(err.message(), "attributed_to link url is required");
}

fn work_around_eventual_consistency() {
    std::thread::sleep(std::time::Duration::from_millis(500));
}
