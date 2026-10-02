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

#[tokio::test]
async fn get_profile_hints_the_known_as_claim_and_its_verifies() {
    let mut profiles = profile_service().await;

    let mut client = TestClient::new().await;
    client.github_verification_claim("Alice", DEFAULT_CREATED_AT);
    let claim_key = client.get_last_event_key();
    client.profile_update(
        ProfileUpdate {
            known_as: Some(claim_key.clone()),
            ..Default::default()
        },
        DEFAULT_CREATED_AT,
    );
    client.submit_events().await;

    let mut verifier = TestClient::new().await;
    verifier.verification_verify(claim_key.clone(), DEFAULT_CREATED_AT);
    let verify_key = verifier.get_last_event_key();
    verifier.submit_events().await;

    let response = profiles
        .get_profile(GetProfileRequest {
            identity: client.identity().to_owned(),
        })
        .await
        .unwrap()
        .into_inner();

    let hint_event_keys = list_hint_event_keys(&response.event_hints);
    assert!(hint_event_keys.contains(&claim_key));
    assert!(hint_event_keys.contains(&verify_key));
    assert!(
        list_hint_identities(&response.event_hints)
            .contains(&verifier.identity().to_owned())
    );
}

#[tokio::test]
async fn get_profile_skips_a_deleted_known_as_claim() {
    let mut profiles = profile_service().await;

    let mut client = TestClient::new().await;
    client.github_verification_claim("Alice", DEFAULT_CREATED_AT);
    let claim_key = client.get_last_event_key();
    client.profile_update(
        ProfileUpdate {
            known_as: Some(claim_key.clone()),
            ..Default::default()
        },
        DEFAULT_CREATED_AT,
    );
    client.submit_events().await;

    let mut verifier = TestClient::new().await;
    verifier.verification_verify(claim_key.clone(), DEFAULT_CREATED_AT);
    let verify_key = verifier.get_last_event_key();
    verifier.submit_events().await;

    client.delete_key(claim_key.clone(), DEFAULT_CREATED_AT);
    client.submit_events().await;

    let response = profiles
        .get_profile(GetProfileRequest {
            identity: client.identity().to_owned(),
        })
        .await
        .unwrap()
        .into_inner();

    let hint_event_keys = list_hint_event_keys(&response.event_hints);
    assert!(!hint_event_keys.contains(&claim_key));
    assert!(!hint_event_keys.contains(&verify_key));
}

fn list_hint_event_keys(hints: &[EventHint]) -> Vec<EventKey> {
    hints
        .iter()
        .filter_map(|hint| {
            let signed_event =
                hint.event_bundle.as_ref()?.signed_event.as_ref()?;
            Event::decode(&*signed_event.event_bytes).ok()?.key
        })
        .collect()
}

fn list_hint_identities(hints: &[EventHint]) -> Vec<String> {
    hints
        .iter()
        .filter_map(|hint| {
            let content =
                hint.event_bundle.as_ref()?.serialized_content.as_ref()?;
            match Content::decode(&*content.content_bytes).ok()?.content_body {
                Some(ContentBody::Identity(identity)) => {
                    Some(identity.derive_hex_key())
                }
                _ => None,
            }
        })
        .collect()
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
