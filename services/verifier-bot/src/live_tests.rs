//! The verify flow against a real Polycentric server (the first of
//! `HARBOR_VERIFIER_BOT_SERVERS`, default east.polycentric.dev, also read
//! from `.test.env`). Ignored by default; run with
//! `cargo test -p verifier-bot -- --ignored live_`.

use std::sync::Arc;

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::Event;
use polycentric_core::sdk::storage::sqlite::SqliteStorage;
use polycentric_core::sdk::types::SyncStrategy;
use polycentric_core::sdk::{Client, ClientConfig};
use prost::Message;

use crate::claims::testing::claim_content;
use crate::claims::{SCHEMA_NAME, event_id};
use crate::verifier::VerifyRequest;
use crate::verifier::testing::dummy;

fn test_server() -> String {
    common_dotenv::load(".test.env");
    std::env::var("HARBOR_VERIFIER_BOT_SERVERS")
        .ok()
        .and_then(|s| s.split(',').next().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or("https://east.polycentric.dev".into())
}

async fn make_client() -> Client {
    let client = Client::open(ClientConfig {
        storage: Arc::new(SqliteStorage::open_in_memory().unwrap()),
        key_cipher: None,
        seed_servers: vec![test_server()],
        application: None,
        persistent: false,
    })
    .await
    .unwrap();
    client.create_identity(None).await.unwrap();
    client
}

/// Publish a verification claim and return its hex EventKey id.
async fn publish_claim(client: &Client, schema_name: &str, fields: &[(&str, &str)]) -> String {
    let bundle = client
        .publish_content(
            &claim_content(schema_name, fields),
            collections::VERIFICATIONS,
        )
        .await
        .unwrap();
    client.sync(SyncStrategy::PartialPush).await.unwrap();
    let event = Event::decode(bundle.signed_event.unwrap().event_bytes.as_slice()).unwrap();
    event_id(&event.key.unwrap())
}

fn json_request(body: &str) -> VerifyRequest<'_> {
    VerifyRequest {
        content_type: Some("application/json"),
        body: body.as_bytes(),
        challenge_response: None,
    }
}

#[tokio::test]
#[ignore = "needs a live Polycentric server"]
async fn live_text_success() {
    let client = make_client().await;
    // The loop-back token is the claim author's identity key.
    let token = client.active_identity().unwrap();
    // `platform` and `url` are display metadata; only `account` is proofed.
    let claim_id = publish_claim(
        &client,
        SCHEMA_NAME,
        &[
            ("platform", "hacker-news"),
            ("account", "test"),
            ("url", "https://news.ycombinator.com/user?id=test"),
        ],
    )
    .await;

    let verifier = dummy("Hacker News", &token);
    let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
    let result = verifier.request_verify(&client, json_request(&body)).await;
    assert!(result.is_ok(), "{result:?}");
}

#[tokio::test]
#[ignore = "needs a live Polycentric server"]
async fn live_text_fail_on_wrong_schema() {
    let client = make_client().await;
    let claim_id = publish_claim(&client, "Freeform", &[("name", "test")]).await;

    let verifier = dummy("Hacker News", "token");
    let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
    assert!(
        verifier
            .request_verify(&client, json_request(&body))
            .await
            .is_err()
    );
}

#[tokio::test]
#[ignore = "needs a live Polycentric server"]
async fn live_text_fail_on_platform_mismatch() {
    let client = make_client().await;
    let token = client.active_identity().unwrap();
    let claim_id = publish_claim(
        &client,
        SCHEMA_NAME,
        &[("platform", "youtube"), ("account", "test")],
    )
    .await;

    let verifier = dummy("Hacker News", &token);
    let body = format!(r#"{{"claimId":"{claim_id}"}}"#);
    assert!(
        verifier
            .request_verify(&client, json_request(&body))
            .await
            .is_err()
    );
}
