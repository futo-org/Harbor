//! Tests for deleting identities.

use crate::*;

#[tokio::test]
async fn deleting_identity() {
    let mut client = TestClient::new().await;
    client.submit_events().await;

    client.delete_self().await;
}

// TODO: add more tests.
