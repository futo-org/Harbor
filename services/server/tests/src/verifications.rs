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
    client.github_verification_claim("Alice", DEFAULT_CREATED_AT);
    let verification_claim_key = client.get_last_event_key();
    client.submit_events().await;

    let response = verifications
        .list_verification_claims(ListVerificationClaimsRequest {
            claimed_by_identity: client.identity().to_owned(),
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
