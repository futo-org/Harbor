//! Tests for deleting identities.

use crate::event_sync::{ExpectError, expect_errors};
use crate::*;

#[tokio::test]
async fn deleting_identity() {
    let mut client = TestClient::new().await;
    client.submit_events().await;

    client.delete_self().await;

    no_events(&mut client).await;

    client.post_text("I'm deleted", current_timestamp());
    let result = client.try_submit_events().await;
    expect_errors(result, &[ExpectError::no_identity()], &[]);

    no_events(&mut client).await;
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

// TODO: add more tests.
