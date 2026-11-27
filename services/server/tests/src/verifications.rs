//! Tests for the verification service.

use std::slice;

use crate::*;

#[tokio::test]
async fn list_verification_claims_none() {
    let mut verifications = verifications_service().await;

    let mut client = TestClient::new().await;
    client.submit_events().await;

    let response = verifications
        .list_verification_claims(ListVerificationClaimsRequest {
            claimed_by_identity: client.identity().to_owned(),
            omit_labels: Vec::new(),
        })
        .await
        .unwrap()
        .into_inner();

    expect_claims(&response.claim_bundles, vec![]);
    expect_hints(&response.event_hints, vec![]);
}

#[tokio::test]
async fn list_verification_claims_one() {
    let mut verifications = verifications_service().await;

    let mut client = TestClient::new().await;
    client.github_verification_claim("Alice", current_timestamp());
    let verification_claim_key = client.get_last_event_key();
    client.submit_events().await;

    let response = verifications
        .list_verification_claims(ListVerificationClaimsRequest {
            claimed_by_identity: client.identity().to_owned(),
            omit_labels: Vec::new(),
        })
        .await
        .unwrap()
        .into_inner();

    expect_claims(
        &response.claim_bundles,
        vec![ExpectVerificationClaim {
            claim: ExpectEvent {
                key: verification_claim_key,
                kind: ExpectEventKind::VerificationClaim {
                    schema: github_verification_schema(),
                    fields: {
                        let mut m = HashMap::new();
                        m.insert("login", "Alice");
                        m
                    },
                },
            },
            targets: vec![],
            verifies: vec![],
        }],
    );
    expect_hints(
        &response.event_hints,
        vec![
            ExpectHint::moderator_identity(),
            ExpectHint::Identity(client.identity().to_owned()),
        ],
    );
}

#[tokio::test]
async fn get_verification_claim_with_label() {
    let mut verifications = verifications_service().await;
    let (mut moderator, _guard) = TestClient::trusted_moderator().await;

    let mut client = TestClient::new().await;
    client.github_verification_claim("Alice", current_timestamp());
    let claim_key = client.get_last_event_key();
    client.submit_events().await;
    moderator.label_key(
        claim_key.clone(),
        vec!["violence".to_owned()],
        current_timestamp(),
    );
    moderator.submit_events().await;

    let response = verifications
        .get_verification_claim(GetVerificationClaimRequest {
            identity: claim_key.identity.clone(),
            sequence: claim_key.sequence,
        })
        .await
        .unwrap()
        .into_inner();

    expect_events(
        &response.candidates,
        &[ExpectEvent {
            key: claim_key.clone(),
            kind: ExpectEventKind::VerificationClaim {
                schema: github_verification_schema(),
                fields: HashMap::from([("login", "Alice")]),
            },
        }],
    );
    expect_hints(
        &response.event_hints,
        vec![
            ExpectHint::moderator_identity(),
            ExpectHint::Identity(client.identity().to_owned()),
            ExpectHint::Labels {
                post: claim_key,
                values: vec!["violence".to_owned()],
            },
        ],
    );
}

#[tokio::test]
async fn get_verification_claim_deleted() {
    let mut verifications = verifications_service().await;

    let mut client = TestClient::new().await;
    client.github_verification_claim("Alice", current_timestamp());
    let claim_key = client.get_last_event_key();
    client.delete_key(claim_key.clone(), current_timestamp() + 1);
    client.submit_events().await;

    let response = verifications
        .get_verification_claim(GetVerificationClaimRequest {
            identity: claim_key.identity,
            sequence: claim_key.sequence,
        })
        .await
        .unwrap()
        .into_inner();

    expect_events(&response.candidates, &[]);
}

#[tokio::test]
async fn get_verification_claim_skips_other_verification_events() {
    let mut verifications = verifications_service().await;

    let mut client = TestClient::new().await;
    client.github_verification_claim("Alice", current_timestamp());
    let claim_key = client.get_last_event_key();
    // The Delete goes into the verifications collection, at the next
    // sequence.
    client.delete_key(claim_key, current_timestamp() + 1);
    let delete_key = client.get_last_event_key();
    client.submit_events().await;

    let response = verifications
        .get_verification_claim(GetVerificationClaimRequest {
            identity: delete_key.identity,
            sequence: delete_key.sequence,
        })
        .await
        .unwrap()
        .into_inner();

    expect_events(&response.candidates, &[]);
}

#[tokio::test]
async fn verification_claim_images_are_requested_as_blobs() {
    let mut client = TestClient::new().await;
    let body = format!("claim-image-{}", random_string()).into_bytes();
    let blob = Blob {
        digest: Some(content_digest(&body)),
        mime_type: "image/jpeg".to_owned(),
        size: body.len() as i64,
    };
    let schema_bytes = prost::Message::encode_to_vec(&VerificationSchema {
        name: "Freeform".to_owned(),
        ..Default::default()
    });
    let claim = VerificationClaim {
        schema: Some(SerializedVerificationSchema {
            digest: Some(content_digest(&schema_bytes)),
            schema_bytes,
        }),
        fields: HashMap::new(),
        images: vec![ImageSet {
            images: vec![Image {
                blob: Some(blob.clone()),
                width: 100,
                height: 100,
            }],
        }],
    };
    client.verification_claim(claim, current_timestamp());
    let event_bundles = client.take_pending_events();

    let request = as_identity(
        client.identity(),
        client.signing_key(),
        PutEventsRequest { event_bundles },
    );
    let response = client
        .event_sync_client()
        .put_events(request)
        .await
        .expect("put_events failed")
        .into_inner();

    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    assert_eq!(response.requested_blobs, vec![blob]);
}

#[derive(Debug)]
struct ExpectVerificationClaim<'a> {
    claim: ExpectEvent<'a>,
    targets: Vec<ExpectEvent<'a>>,
    verifies: Vec<ExpectEvent<'a>>,
}

fn expect_claims(
    got: &[VerificationClaimBundle],
    expected: Vec<ExpectVerificationClaim<'_>>,
) {
    eprintln!("Got claims: {:#?}", got);
    eprintln!("Expected claims: {:#?}", expected);
    assert_eq!(got.len(), expected.len());
    for (got, expected) in got.iter().zip(expected) {
        let got_claim = got.claim.as_ref().expect("missing claim");
        expect_events(
            slice::from_ref(got_claim),
            slice::from_ref(&expected.claim),
        );
        expect_events(&got.targets, &expected.targets);
        expect_events(&got.verifies, &expected.verifies);
    }
}
