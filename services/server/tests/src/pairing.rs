//! `PairingService` tests.

use crate::*;

/// Signs the first issuer state of a new session for `issuer`, reporting
/// `identity_state` as the issuer's most recent identity event.
/// Returns the signed state and the session's `digest_sha256`.
fn new_session(
    issuer: &TestClient,
    identity_state: EventBundle,
) -> (SignedIssuerState, Vec<u8>) {
    let digest = PairingSessionDigest {
        issuer_identity: issuer.identity().to_owned(),
        issuer_signer: Some(issuer.public_key()),
        nonce: random_string().into_bytes(),
        initial_timestamp: current_timestamp() as i64,
        ttl_millis: 5 * 60 * 1000,
    };
    let session_digest = digest.encode_to_vec();
    let digest_sha256 = sha256(&session_digest);
    let state_bytes = IssuerPairingState {
        session_digest,
        identity_state: Some(identity_state),
        sequence: 1,
    }
    .encode_to_vec();
    let signature = issuer.key.sign(&state_bytes).to_bytes().to_vec();
    let signed = SignedIssuerState {
        state_bytes,
        signature,
    };
    (signed, digest_sha256)
}

#[tokio::test]
async fn claimer_joins_pairing_session() {
    let mut issuer = TestClient::new().await;
    let identity_state = issuer.get_last_event_bundle();
    issuer.submit_events().await;

    let (issuer_state, digest_sha256) = new_session(&issuer, identity_state);
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
    assert_eq!(get.session_state.unwrap().issuer_state, Some(issuer_state));

    let claimer_key = public_key_of(&generate_signing_key());
    let join = pairing
        .join_pairing_session(JoinPairingSessionRequest {
            digest_sha256: digest_sha256.clone(),
            claimer_key: Some(claimer_key.clone()),
        })
        .await
        .expect("join_pairing_session failed")
        .into_inner();
    assert_eq!(
        join.session_state.unwrap().claimers,
        vec![claimer_key.clone()]
    );

    // Joining again with the same key is a no-op.
    let rejoin = pairing
        .join_pairing_session(JoinPairingSessionRequest {
            digest_sha256: digest_sha256.clone(),
            claimer_key: Some(claimer_key.clone()),
        })
        .await
        .expect("second join_pairing_session failed")
        .into_inner();
    assert_eq!(
        rejoin.session_state.unwrap().claimers,
        vec![claimer_key.clone()]
    );

    let get = pairing
        .get_pairing_session(GetPairingSessionRequest { digest_sha256 })
        .await
        .expect("get_pairing_session failed")
        .into_inner();
    assert_eq!(get.session_state.unwrap().claimers, vec![claimer_key]);
}

#[tokio::test]
async fn join_unknown_pairing_session_is_not_found() {
    let err = pairing_service()
        .await
        .join_pairing_session(JoinPairingSessionRequest {
            digest_sha256: sha256(random_string().as_bytes()),
            claimer_key: Some(public_key_of(&generate_signing_key())),
        })
        .await
        .expect_err("joined a session that does not exist");
    assert_eq!(err.code(), tonic::Code::NotFound);
    assert_eq!(err.message(), "session not found");
}
