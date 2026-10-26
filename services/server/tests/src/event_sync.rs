//! Tests for the event sync service.

use crate::*;

#[tokio::test]
async fn put_then_list_round_trip() {
    let mut client = TestClient::new().await;

    let post_signature = client.post_text("hello", current_timestamp() + 1);

    client.submit_events().await;

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
        .expect("list_events failed");

    let bundles = response.into_inner().event_bundles;
    assert!(
        bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_signature)
            .unwrap_or(false)),
        "expected our post in the list response",
    );
}

#[tokio::test]
async fn invalid_signature_rejected() {
    let mut client = connect_event_sync().await;
    let key = generate_signing_key();
    let initial = Identity {
        rotation_keys: vec![public_key_of(&key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let identity = initial.derive_hex_key();

    let mut bundle = make_post_bundle(
        &identity,
        &key,
        1,
        1,
        vec![1],
        vec![],
        "tampered",
        &[],
        current_timestamp(),
    );
    if let Some(ref mut signed) = bundle.signed_event {
        signed.signature[0] ^= 0xFF;
    }

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect("put_events failed");
    let inner = response.into_inner();
    assert!(
        inner
            .errors
            .iter()
            .any(|e| e.message.contains("signature invalid")),
        "tampered signature must be rejected, got errors: {:?}",
        inner.errors,
    );
}

/// A revokes B after B has written two FEED events. The pre-revocation
/// event below the head must still appear in `list_events` AND carry a
/// valid `EventProof` whose audit path verifies against the head's
/// `previous_root`.
#[tokio::test]
async fn revoked_key_pre_revocation_events_remain_valid() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();
    let signing_key = generate_signing_key();

    // Genesis content: rotation=[A], signing=[B].
    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![public_key_of(&signing_key)],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let identity = initial.derive_hex_key();

    // Genesis identity event signed by A. Dedup keys = [A, B]; VC = [1, 0].
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        current_timestamp(),
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis],
        })
        .await
        .expect("genesis put failed");

    // B writes FEED event 1: previous_root is empty (no prior events).
    // VC for FEED: [A_max=0, B_max=1].
    let post_1 = make_post_bundle(
        &identity,
        &signing_key,
        1,
        1,
        vec![0, 1],
        vec![],
        "first post",
        &[],
        current_timestamp() + 1,
    );
    let sig_1 = bundle_signature(&post_1);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_1],
        })
        .await
        .expect("post_1 put failed");

    // B writes FEED event 2: previous_root commits to a one-leaf tree of sig_1.
    // VC for FEED: [A_max=0, B_max=2].
    let root_after_1 = leaf_hash(&sig_1);
    let post_2 = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        root_after_1.clone(),
        "second post",
        &[],
        current_timestamp() + 2,
    );
    let sig_2 = bundle_signature(&post_2);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_2],
        })
        .await
        .expect("post_2 put failed");

    // A rotates and revokes B. Target pins post_2 as head; its tree has
    // one leaf (post_1), so root = leaf_hash(sig_1) and leaf_count = 1.
    let revoked_content = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![make_revocation_bound(
            &signing_key,
            COLLECTION_FEED,
            sig_2.clone(),
            root_after_1.clone(),
            1,
        )],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked_content,
        current_timestamp() + 3,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![rotation],
        })
        .await
        .expect("rotation put failed");

    // List events for the identity.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity,
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;

    // Both of B's events should still be visible.
    let bundle_1 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_1)
                .unwrap_or(false)
        })
        .expect("post_1 missing from list_events response");
    let bundle_2 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_2)
                .unwrap_or(false)
        })
        .expect("post_2 missing from list_events response");

    // post_2 IS the head — server should attach no proof.
    assert!(
        bundle_2.event_proofs.is_empty(),
        "head event should carry no EventProof (it equals the target)",
    );

    // post_1 is a non-head pre-revocation event — server should attach
    // exactly one proof against post_2.
    assert_eq!(
        bundle_1.event_proofs.len(),
        1,
        "expected exactly one EventProof attached to post_1, got {}",
        bundle_1.event_proofs.len(),
    );
    let proof = &bundle_1.event_proofs[0];
    assert_eq!(
        proof.target_signature, sig_2,
        "proof's target must be the head event"
    );
    assert_eq!(proof.leaf_index, 0, "post_1 is at leaf index 0");
    assert!(
        proof.audit_path.is_empty(),
        "a single-leaf tree has an empty audit path; got {} hashes",
        proof.audit_path.len(),
    );

    // Cryptographically verify the proof against the head's recorded root.
    // For a one-leaf tree the root IS the leaf hash, so the verification
    // reduces to checking leaf_hash(sig_1) == root_after_1.
    assert_eq!(
        leaf_hash(&sig_1),
        root_after_1,
        "recomputed root should match the bound's recorded root",
    );
}

/// After A revokes B, B writes a third post (post-revocation). The server
/// still stores it (signatures verify), but `attach_proofs` can't build a
/// valid proof — post_3 is not a leaf of the head's tree — so the bundle
/// comes back with no `event_proofs`, which a downstream validator treats
/// as a post-revocation forgery.
#[tokio::test]
async fn post_revocation_event_returns_without_proof() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();
    let signing_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![public_key_of(&signing_key)],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let identity = initial.derive_hex_key();

    // Genesis.
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        current_timestamp(),
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis],
        })
        .await
        .expect("genesis put failed");

    // B writes post_1, then post_2.
    let post_1 = make_post_bundle(
        &identity,
        &signing_key,
        1,
        1,
        vec![0, 1],
        vec![],
        "first post",
        &[],
        current_timestamp() + 1,
    );
    let sig_1 = bundle_signature(&post_1);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_1],
        })
        .await
        .expect("post_1 put failed");

    let root_after_1 = leaf_hash(&sig_1);
    let post_2 = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        root_after_1.clone(),
        "second post",
        &[],
        current_timestamp() + 2,
    );
    let sig_2 = bundle_signature(&post_2);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_2],
        })
        .await
        .expect("post_2 put failed");

    // A rotates to revoke B. Target pins post_2 as the head.
    let revoked = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![make_revocation_bound(
            &signing_key,
            COLLECTION_FEED,
            sig_2.clone(),
            root_after_1.clone(),
            1,
        )],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked,
        current_timestamp() + 3,
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![rotation],
        })
        .await
        .expect("rotation put failed");

    // B forges a post_3 after revocation. The signature is valid (B still
    // holds the key), so the server stores it.
    let post_3 = make_post_bundle(
        &identity,
        &signing_key,
        3,
        1,
        vec![0, 3],
        node_hash(&leaf_hash(&sig_1), &leaf_hash(&sig_2)),
        "forged post",
        &[],
        current_timestamp() + 4,
    );
    let sig_3 = bundle_signature(&post_3);

    // B forges a post_3 after revocation. The signature is valid (B still
    // holds the key), but `authorize_event_signer` rejects it because B's
    // key is revoked and post_3 is not within the committed bound. The
    // server returns the rejection in the response errors, not as a gRPC
    // error.
    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_3],
        })
        .await
        .expect("put_events call succeeded");
    let inner = response.into_inner();
    assert!(
        inner.errors.iter().any(|e| e.message.contains("revoked")),
        "post-revocation event must be rejected, got errors: {:?}",
        inner.errors,
    );

    // Also verify it didn't end up in the events table by accident.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity,
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;
    assert!(
        !bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == sig_3)
            .unwrap_or(false)),
        "post-revocation event must NOT appear in list_events",
    );
}

/// B writes three posts, but the version of post_2 that reaches the
/// server differs from the version the rotator hashed into the bound.
/// The server's canonical reconstruction yields a different root than
/// the bound records, so no proof can be generated for any of B's
/// pre-revocation events.
#[tokio::test]
async fn rewritten_event_invalidates_proofs() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();
    let signing_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![public_key_of(&signing_key)],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let identity = initial.derive_hex_key();

    // Genesis.
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        current_timestamp(),
    );
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis],
        })
        .await
        .expect("genesis put failed");

    // post_1 — same in both views.
    let post_1 = make_post_bundle(
        &identity,
        &signing_key,
        1,
        1,
        vec![0, 1],
        vec![],
        "first post",
        &[],
        current_timestamp() + 1,
    );
    let sig_1 = bundle_signature(&post_1);

    // post_2_original — the version the rotator hashes into the bound.
    // Never PUT to the server.
    let post_2_original = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        leaf_hash(&sig_1),
        "ORIGINAL second post",
        &[],
        current_timestamp() + 2,
    );
    let sig_2_original = bundle_signature(&post_2_original);

    // post_3 — references the rotator's view of history. previous_root is
    // the MMR over [sig_1, sig_2_original].
    let root_after_2_original =
        node_hash(&leaf_hash(&sig_1), &leaf_hash(&sig_2_original));
    let post_3 = make_post_bundle(
        &identity,
        &signing_key,
        3,
        1,
        vec![0, 3],
        root_after_2_original.clone(),
        "third post",
        &[],
        current_timestamp() + 3,
    );
    let sig_3 = bundle_signature(&post_3);

    // post_2_rewritten — different content at the same (collection, identity,
    // signer, sequence). This is what the server actually receives.
    let post_2_rewritten = make_post_bundle(
        &identity,
        &signing_key,
        2,
        1,
        vec![0, 2],
        leaf_hash(&sig_1),
        "REWRITTEN second post",
        &[],
        current_timestamp() + 2,
    );

    // A revokes B. Target pins post_3 as head with the rotator's-view root.
    let revoked = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![make_revocation_bound(
            &signing_key,
            COLLECTION_FEED,
            sig_3.clone(),
            root_after_2_original.clone(),
            2,
        )],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked,
        current_timestamp() + 4,
    );

    // PUT in order. Note: post_2_rewritten replaces post_2_original — the
    // original is never seen by the server.
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_1, post_2_rewritten, post_3, rotation],
        })
        .await
        .expect("puts failed");

    // List events.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: identity.clone(),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;

    // post_1 must come back with NO proof — the server's canonical
    // reconstruction over [sig_1, sig_2_rewritten] yields a different root
    // than the bound recorded (which used sig_2_original).
    let bundle_1 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_1)
                .unwrap_or(false)
        })
        .expect("post_1 missing from list_events response");
    assert!(
        bundle_1.event_proofs.is_empty(),
        "rewriting an in-tree event must invalidate proofs for sibling leaves; got {} proofs",
        bundle_1.event_proofs.len(),
    );

    // Sanity: the recomputed roots from the two views are in fact different.
    let root_after_2_rewritten = node_hash(
        &leaf_hash(&sig_1),
        &leaf_hash(&bundle_signature(&make_post_bundle(
            &identity,
            &signing_key,
            2,
            1,
            vec![0, 2],
            leaf_hash(&sig_1),
            "REWRITTEN second post",
            &[],
            current_timestamp() + 2,
        ))),
    );
    assert_ne!(
        root_after_2_original, root_after_2_rewritten,
        "rewritten root must differ from the bound's recorded root",
    );
}

#[tokio::test]
async fn put_verification_claim_is_ingested_and_listable() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let identity = initial.derive_hex_key();

    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        initial,
        current_timestamp(),
    );
    let claim = make_verification_claim_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        "alice",
        current_timestamp() + 1,
    );
    let claim_signature = bundle_signature(&claim);

    let response = client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis, claim],
        })
        .await
        .expect("put_events failed")
        .into_inner();
    // Ingestion (and the claim/schema child-table writes) must succeed.
    assert!(
        response.errors.is_empty(),
        "ingest reported errors: {:?}",
        response.errors
    );

    let listed = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity,
                collection: Some(COLLECTION_VERIFICATIONS),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed")
        .into_inner();

    assert!(
        listed.event_bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .is_some_and(|s| s.signature == claim_signature)),
        "stored verification claim not returned",
    )
}

#[tokio::test]
async fn events_submitted_twice_are_ignored() {
    let mut client = TestClient::new().await;
    let post_signature = client.post_text("hello", current_timestamp() + 1);
    let pending = client.pending.clone();
    // Submit everything.
    client.submit_events().await;

    // And again.
    client.pending = pending;
    client.submit_events().await;

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
        .expect("list_events failed");

    let bundles = response.into_inner().event_bundles;
    assert_eq!(bundles.len(), 2); // Identity & post.
    assert!(
        bundles.iter().any(|b| b
            .signed_event
            .as_ref()
            .map(|se| se.signature == post_signature)
            .unwrap_or(false)),
        "expected our post in the list response",
    );
}

#[tokio::test]
async fn validation_missing_signed_event() {
    let mut client = TestClient::new().await;
    client.pending.last_mut().unwrap().signed_event = None;
    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains("signed event missing"),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_invalid_signed_event_signature() {
    let mut client = TestClient::new().await;
    client
        .pending
        .last_mut()
        .unwrap()
        .signed_event
        .as_mut()
        .unwrap()
        .signature = b"incorrect".into();
    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "signed event signature invalid",
            ),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_invalid_signed_event_bytes() {
    let mut client = TestClient::new().await;
    client
        .pending
        .last_mut()
        .unwrap()
        .signed_event
        .as_mut()
        .unwrap()
        .event_bytes = [255; 1].into();
    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains("signed event bytes invalid"),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_missing_event_key() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.key = None;
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains("event key is missing"),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_invalid_event_collection() {
    let mut client = TestClient::new().await;

    let post = Post {
        text: "Hello!".to_owned(),
        reply: None,
        images: Vec::new(),
        quote: None,
        links: Vec::new(),
        labels: Vec::new(),
        attributed_to: Vec::new(),
    };
    let content = Content {
        content_body: Some(ContentBody::Post(post)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    event.key.as_mut().unwrap().collection = 9999;
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '2'",
            ),
        }],
    );
}

#[tokio::test]
#[ignore = "TODO: validate this"]
async fn validation_invalid_event_identity() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.key.as_mut().unwrap().identity = "invalid".to_owned();
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains("event key identity invalid"),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_missing_event_signed_by() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.key.as_mut().unwrap().signed_by = None;
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event key signed by is missing",
            ),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_invalid_event_signed_by_key_type() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event
        .key
        .as_mut()
        .unwrap()
        .signed_by
        .as_mut()
        .unwrap()
        .key_type = 999;
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "signed event signature invalid",
            ),
        }],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event key signed by key type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_signed_by_key() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.key.as_mut().unwrap().signed_by.as_mut().unwrap().key =
        b"incorrect01234567890123456789012".into();
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "signed event signature invalid",
            ),
        }],
        &[],
    );
}

// TODO: invalid (duplicate) signed_event.key.sequence.
// TODO: invalid signed_event.identity_sequence
// TODO: invalid signed_event.vector_clock
// TODO: invalid signed_event.previous_signature
// TODO: invalid signed_event.content_digest

#[tokio::test]
async fn validation_missing_event_content_digest() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.content_digest = None;
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event content digest is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_content_digest_type() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.content_digest.as_mut().unwrap().r#type = 999;
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "unsupported content digest type: 999",
            ),
        }],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event content digest type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_content_digest_value() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );

    event.content_digest.as_mut().unwrap().value =
        b"incorrect01234567890123456789012".into();
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains("content digest does not match"),
        }],
        &[],
    );
}

// NOTE: no validation for signed_event.created_at.

// TODO: invalid signed_event.previous_root

#[tokio::test]
async fn validation_invalid_event_application_name_empty() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "".to_owned(),
        id: "integration-tests".to_owned(),
        version: "0.0.0".to_owned(),
        url: "http://example.com".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application name can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_name_too_long() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "I".repeat(51),
        id: "integration-tests".to_owned(),
        version: "0.0.0".to_owned(),
        url: "http://example.com".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application name is too long (51), maximum is 50",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_id_empty() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "".to_owned(),
        version: "0.0.0".to_owned(),
        url: "http://example.com".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application id can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_id_too_long() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "i".repeat(201),
        version: "0.0.0".to_owned(),
        url: "http://example.com".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application id is too long",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_version_empty() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "integration-tests".to_owned(),
        version: "".to_owned(),
        url: "http://example.com".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application version can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_version_too_long() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "integration-tests".to_owned(),
        version: "0".repeat(201),
        url: "http://example.com".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application version is too long",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_url_empty() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "integration-tests".to_owned(),
        version: "0.0.0".to_owned(),
        url: "".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[
            ExpectError {
                bundle_index: 0,
                kind: ExpectErrorKind::MsgContains(
                    "event application url can't be empty",
                ),
            },
            ExpectError {
                bundle_index: 0,
                kind: ExpectErrorKind::MsgContains(
                    "event application url is not a valid URL",
                ),
            },
        ],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_url_too_long() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "integration-tests".to_owned(),
        version: "0.0.0".to_owned(),
        url: "h".repeat(101),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[
            ExpectError {
                bundle_index: 0,
                kind: ExpectErrorKind::MsgContains(
                    "event application url is too long (101), maximum is 100",
                ),
            },
            ExpectError {
                bundle_index: 0,
                kind: ExpectErrorKind::MsgContains(
                    "event application url is not a valid URL",
                ),
            },
        ],
    );
}

#[tokio::test]
async fn validation_invalid_event_application_url_not_an_url() {
    let mut client = TestClient::new().await;
    client.pending.clear(); // Remove valid identity event.

    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let mut event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    event.application = Some(Application {
        name: "Integration Tests".to_owned(),
        id: "integration-tests".to_owned(),
        version: "0.0.0".to_owned(),
        url: "INVALID_URL".to_owned(),
    });
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event application url is not a valid URL",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_serialized_content_content_bytes() {
    let mut client = TestClient::new().await;
    client
        .pending
        .last_mut()
        .unwrap()
        .serialized_content
        .as_mut()
        .unwrap()
        .content_bytes = b"".into();

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains("content digest does not match"),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_missing_content_content_body() {
    let mut client = TestClient::new().await;
    let content = Content { content_body: None };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body is missing",
            ),
        }],
    );
}

// TODO: tests for post content.

#[tokio::test]
async fn validation_missing_content_content_body_delete_event_key() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Delete(Delete { event_key: None })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body delete event key is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_delete_event_key_collection() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Delete(Delete {
            event_key: Some(EventKey {
                collection: COLLECTION_FEED + 1,
                identity: client.identity().to_owned(),
                signed_by: Some(client.public_key()),
                sequence: 1,
            }),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '3'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_delete_event_key_identity() {
    let mut other_client = TestClient::new().await;
    other_client.pending.clear(); // Unused.
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Delete(Delete {
            event_key: Some(EventKey {
                collection: COLLECTION_FEED,
                identity: other_client.identity().to_owned(),
                signed_by: Some(client.public_key()),
                sequence: 1,
            }),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "delete event key identity mismatch",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_follow_collection() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Follow(Follow {
            identity: "0000000000000000000000000000000000000000000000000000000000000000".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '5'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_follow_identity() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Follow(Follow {
            identity: "invalid000000000000000000000000000000000000000000000000000000000".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_SOCIAL_GRAPH,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body follow identity is not a valid identity",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_follow_identity_self() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Follow(Follow {
            identity: client.identity.to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_SOCIAL_GRAPH,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "follow identity is invalid, can't follow yourself",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_block_collection() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Block(Block {
            identity: "0000000000000000000000000000000000000000000000000000000000000000".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '5'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_block_identity() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Block(Block {
            identity: "invalid000000000000000000000000000000000000000000000000000000000".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_SOCIAL_GRAPH,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body block identity is not a valid identity",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_block_identity_self() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Block(Block {
            identity: client.identity.to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_SOCIAL_GRAPH,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "block identity is invalid, can't block yourself",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_reaction_collection() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Reaction(Reaction {
            event_key: Some(event_key),
            emoji: Some("👍".to_owned()),
            positive: true,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '4'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_reaction_no_event_key() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Reaction(Reaction {
            event_key: None,
            emoji: Some("👍".to_owned()),
            positive: true,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body reaction event key is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_reaction_empty_emoji() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Reaction(Reaction {
            event_key: Some(event_key),
            emoji: Some("".to_owned()),
            positive: true,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_content_content_body_reaction_flags_ok() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Reaction(Reaction {
            event_key: Some(event_key),
            emoji: Some("🇳🇱".to_owned()),
            positive: true,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_content_content_body_reaction_long_emoji_ok() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Reaction(Reaction {
            event_key: Some(event_key),
            // Longest emoji according to
            // <https://machs.space/posts/whats-the-max-valid-length-of-an-emoji/>.
            emoji: Some("👨🏻‍❤️‍💋‍👨🏻".to_owned()),
            positive: true,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_invalid_content_content_body_reaction_emoji_too_long() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Reaction(Reaction {
            event_key: Some(event_key),
            emoji: Some("👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍".to_owned()),
            positive: true,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "content content body reaction emoji is too long (80), maximum is 40",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_attributed_to_reaction_collection()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: Some(AttributedTo {
                    to: Some(attributed_to::To::Link(Link {
                        title: "Title".to_owned(),
                        description: Some("Description".to_owned()),
                        image: Some("Image".to_owned()),
                        url: "https://example.com".to_owned(),
                        ..Default::default()
                    })),
                }),
                emoji: Some("👍".to_owned()),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '4'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_attributed_to_reaction_no_attributed_to()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: None,
                emoji: Some("👍".to_owned()),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body attributed to reaction attributed to is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_attributed_to_reaction_no_attributed_to_to()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: Some(AttributedTo { to: None }),
                emoji: Some("👍".to_owned()),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body attributed to reaction attributed to to is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_attributed_to_reaction_empty_emoji() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: Some(AttributedTo {
                    to: Some(attributed_to::To::Link(Link {
                        title: "Title".to_owned(),
                        description: Some("Description".to_owned()),
                        image: Some("Image".to_owned()),
                        url: "https://example.com".to_owned(),
                        ..Default::default()
                    })),
                }),
                emoji: Some("".to_owned()),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_content_content_body_attributed_to_reaction_emoji_flags_ok()
{
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: Some(AttributedTo {
                    to: Some(attributed_to::To::Link(Link {
                        title: "Title".to_owned(),
                        description: Some("Description".to_owned()),
                        image: Some("Image".to_owned()),
                        url: "https://example.com".to_owned(),
                        ..Default::default()
                    })),
                }),
                emoji: Some("🇳🇱".to_owned()),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_content_content_body_attributed_to_reaction_emoji_long_ok()
{
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: Some(AttributedTo {
                    to: Some(attributed_to::To::Link(Link {
                        title: "Title".to_owned(),
                        description: Some("Description".to_owned()),
                        image: Some("Image".to_owned()),
                        url: "https://example.com".to_owned(),
                        ..Default::default()
                    })),
                }),
                // Longest emoji according to
                // <https://machs.space/posts/whats-the-max-valid-length-of-an-emoji/>.
                emoji: Some("👨🏻‍❤️‍💋‍👨🏻".to_owned()),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_invalid_content_content_body_attributed_to_reaction_emoji_too_long()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::AttributedToReaction(
            AttributedToReaction {
                attributed_to: Some(AttributedTo {
                    to: Some(attributed_to::To::Link(Link {
                        title: "Title".to_owned(),
                        description: Some("Description".to_owned()),
                        image: Some("Image".to_owned()),
                        url: "https://example.com".to_owned(),
                        ..Default::default()
                    })),
                }),
                emoji: Some(
                    "👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍".to_owned(),
                ),
                positive: true,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body attributed to reaction emoji is too long (80), maximum is 40",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_profile_update_collection() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: None,
            banner: None,
            description: None,
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '3'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_profile_update_name_empty() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: Some("".to_owned()),
            avatar: None,
            banner: None,
            description: None,
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_invalid_content_content_body_profile_update_name_too_long()
{
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: Some("n".repeat(51)),
            avatar: None,
            banner: None,
            description: None,
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body profile update name is too long (51), maximum is 50",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_profile_update_avatar_too_large()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: Some(ImageSet {
                images: vec![Image {
                    blob: Some(Blob {
                        digest: None,
                        mime_type: "image/png".to_owned(),
                        size: (100 * 1024 * 1024) + 1,
                    }),
                    width: 100,
                    height: 100,
                }],
            }),
            banner: None,
            description: None,
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[
            ExpectError {
                bundle_index: 1,
                kind: ExpectErrorKind::MsgContains(
                    "content content body profile update avatar images 0-th blob digest is missing",
                ),
            },
            ExpectError {
                bundle_index: 1,
                kind: ExpectErrorKind::MsgContains(
                    "content content body profile update avatar images 0-th blob size is too large (104857601), maximum is 104857600",
                ),
            },
        ],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_profile_update_banner_too_large()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: None,
            banner: Some(ImageSet {
                images: vec![Image {
                    blob: Some(Blob {
                        digest: None,
                        mime_type: "image/png".to_owned(),
                        size: (100 * 1024 * 1024) + 1,
                    }),
                    width: 100,
                    height: 100,
                }],
            }),
            description: None,
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[
            ExpectError {
                bundle_index: 1,
                kind: ExpectErrorKind::MsgContains(
                    "content content body profile update banner images 0-th blob digest is missing",
                ),
            },
            ExpectError {
                bundle_index: 1,
                kind: ExpectErrorKind::MsgContains(
                    "content content body profile update banner images 0-th blob size is too large (104857601), maximum is 104857600",
                ),
            },
        ],
    );
}

#[tokio::test]
async fn validation_content_content_body_profile_update_description_empty() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: None,
            banner: None,
            description: Some("".to_owned()),
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_invalid_content_content_body_profile_update_description_too_long()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: None,
            banner: None,
            description: Some("a".repeat(161)),
            alias: None,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body profile update description is too long (161), maximum is 160",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_profile_update_alias_empty() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: None,
            banner: None,
            description: None,
            alias: Some("".to_owned()),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_invalid_content_content_body_profile_update_alias_too_long()
{
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
            name: None,
            avatar: None,
            banner: None,
            description: None,
            alias: Some("b".repeat(101)),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_PROFILE_UPDATE,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body profile update alias is too long (101), maximum is 100",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_collection_invalid() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '1'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_rotation_keys_too_many() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: {
            let mut k = Vec::new();
            k.resize(1001, public_key_of(&client.key));
            k
        },
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity rotation keys is too long (1001), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_rotation_keys_key_invalid() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![PublicKey {
            key_type: 999,
            key: Vec::new(),
        }],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity rotation keys 0-th key type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_signing_keys_too_many() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: {
            let mut k = Vec::new();
            k.resize(1001, public_key_of(&client.key));
            k
        },
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity signing keys is too long (1001), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_signing_keys_invalid() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![PublicKey {
            key_type: 999,
            key: Vec::new(),
        }],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity signing keys 0-th key type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_revocation_bounds_too_many() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: {
            let mut k = Vec::new();
            k.resize(
                1001,
                RevocationBound {
                    revoked_key: Some(public_key_of(&client.key)),
                    targets: Vec::new(),
                },
            );
            k
        },
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity revocation bounds is too long (1001), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_revocation_bounds_revoked_key_missing()
 {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![RevocationBound {
            revoked_key: None,
            targets: Vec::new(),
        }],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity revocation bounds 0-th revoked key is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_revocation_bounds_revoked_key_invalid()
 {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![RevocationBound {
            revoked_key: Some(PublicKey {
                key_type: 999,
                key: Vec::new(),
            }),
            targets: Vec::new(),
        }],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity revocation bounds 0-th revoked key key type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_revocation_bounds_revoked_targets_too_many()
 {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![RevocationBound {
            revoked_key: Some(public_key_of(&client.key)),
            targets: {
                let mut k = Vec::new();
                k.resize(
                    201,
                    EventProofTarget {
                        collection: 1,
                        signature: vec![1; 64],
                        root: vec![1; 32],
                        leaf_count: 0,
                    },
                );
                k
            },
        }],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity revocation bounds 0-th targets is too long (201), maximum is 200",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_revocation_bounds_revoked_targets_signature_invalid()
 {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![RevocationBound {
            revoked_key: Some(public_key_of(&client.key)),
            targets: vec![EventProofTarget {
                collection: 1,
                signature: Vec::new(),
                root: vec![1; 32],
                leaf_count: 0,
            }],
        }],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity revocation bounds 0-th targets 0-th signature is too short (0), minimum is 64",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_revocation_bounds_revoked_targets_root_invalid()
 {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![RevocationBound {
            revoked_key: Some(public_key_of(&client.key)),
            targets: vec![EventProofTarget {
                collection: 1,
                signature: vec![1; 64],
                root: Vec::new(),
                leaf_count: 0,
            }],
        }],
        servers: None,
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity revocation bounds 0-th targets 0-th root is too short (0), minimum is 32",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_servers_too_many() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: Some(ServerList {
            urls: {
                let mut u = Vec::new();
                u.resize(101, "https://harbor.social/".to_owned());
                u
            },
        }),
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity servers urls is too long (101), maximum is 100",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_servers_url_empty() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: Some(ServerList {
            urls: vec![String::new()],
        }),
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity servers urls 0-th can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_servers_url_too_long() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: Some(ServerList {
            urls: vec![format!("https://{}.com", "a".repeat(1001))],
        }),
        recovery_key: None,
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity servers urls 0-th is too long (1013), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_recovery_key_invalid() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: Some(PublicKey {
            key_type: 999,
            key: Vec::new(),
        }),
        recovery_signature: None,
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity recovery key key type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_identity_recovery_signature_invalid() {
    let mut client = TestClient::new().await;
    let identity = Identity {
        rotation_keys: vec![public_key_of(&client.key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
        servers: None,
        recovery_key: None,
        recovery_signature: Some(Vec::new()),
    };
    let content = Content {
        content_body: Some(ContentBody::Identity(identity)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_IDENTITY,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body identity recovery signature is too short (0), minimum is 64",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_repost_collection() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Repost(Repost {
            post: Some(event_key),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '2'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_repost_post_missing() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Repost(Repost { post: None })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_FEED,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body repost post is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_repost_post_not_a_post() {
    // This should be fine, the repost will not be considered.
    //
    // No row should be added to the `repost` table, but we can't check that in
    // this test.

    let mut client = TestClient::new().await;
    let event_key = client.get_last_event_key(); // Identity event.
    client.repost_key(event_key, current_timestamp());
    client.submit_events().await;
}

#[tokio::test]
async fn validation_invalid_content_content_body_report_collection() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Report(Report {
            event_key: Some(event_key),
            category: ReportCategory::Spam as i32,
            additional_info: "Test".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '6'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_report_event_key_missing() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Report(Report {
            event_key: None,
            category: ReportCategory::Spam as i32,
            additional_info: "Test".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_REPORTS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body report event key is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_report_invalid_category() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Report(Report {
            event_key: Some(event_key),
            category: i32::MAX,
            additional_info: "Test".to_owned(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_REPORTS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "content content body report category is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_report_additional_info_too_long() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Report(Report {
            event_key: Some(event_key),
            category: ReportCategory::Spam as i32,
            additional_info: "a".repeat(501),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_REPORTS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "content content body report additional info is too long (501), maximum is 500",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_invalid_content_content_body_labels_collection() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(event_key),
            label_values: vec!["Test".to_owned()],
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '7'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_labels_event_key_missing() {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: None,
            label_values: vec!["Test".to_owned()],
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_LABELS,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body labels event key is missing",
            ),
        }],
    );
}

#[tokio::test]
#[ignore = "TODO: implement this validation"]
async fn validation_content_content_body_labels_event_key_not_a_post() {
    let mut client = TestClient::new().await;
    let event_key = client.get_last_event_key(); // Identity.
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(event_key),
            label_values: vec!["Test".to_owned()],
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_LABELS,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body labels event key is not a post",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_labels_labels_values_empty() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(event_key),
            label_values: Vec::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_LABELS,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "content content body labels label values can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_labels_labels_values_too_long() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(event_key),
            label_values: {
                let mut l = Vec::new();
                l.resize(11, "Test".to_owned());
                l
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_LABELS,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "content content body labels label values is too long (11), maximum is 10",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_labels_labels_values_value_empty() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(event_key),
            label_values: vec!["".to_owned()],
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_LABELS,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    client.submit_events().await; // Shouldn't panic.
}

#[tokio::test]
async fn validation_content_content_body_labels_labels_values_value_too_long() {
    let mut client = TestClient::new().await;
    client.post_text("Test", current_timestamp());
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(event_key),
            label_values: vec!["l".repeat(201)],
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_LABELS,
        Vec::new(),
        Vec::new(),
        digest,
        current_timestamp(),
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 2,
            kind: ExpectErrorKind::MsgContains(
                "content content body labels label values 0-th is too long (201), maximum is 200",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_collection() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Test Verification".to_owned(),
        description: "Testing.".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '8'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_too_large() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema_bytes = vec![1; (1 * 1024 * 1024) + 1];
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema bytes is too long (1048577), maximum is 1048576",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_invalid() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema_bytes = vec![255; 1];
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema bytes are invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_digest_invalid() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Test Verification".to_owned(),
        description: "Testing.".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: 99,
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema digest type is invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_digest_mismatch() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Test Verification".to_owned(),
        description: "Testing.".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&[]),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema digest does not match",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_digest_missing() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Test Verification".to_owned(),
        description: "Testing.".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: None,
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema digest is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_name_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "n".repeat(201),
        description: "Testing.".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema name is too long (201), maximum is 200",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_description_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "d".repeat(1001),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema description is too long (1001), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_too_many_fields()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: (0..101)
            .into_iter()
            .map(|n| FieldDef {
                key: format!("key{n}"),
                kind: FieldKind::String as i32,
                format: None,
                required: false,
                description: "Key 1".to_owned(),
                regex: None,
                max_len: None,
            })
            .collect(),
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields is too long (101), maximum is 100",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_key_empty()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th key can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_key_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "k".repeat(201),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th key is too long (201), maximum is 200",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_kind_valid()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: 999,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th kind invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_kind_unspecified()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::Unspecified as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th kind invalid",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_format_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: Some("f".repeat(101)),
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th format is too long (101), maximum is 100",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_description_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "d".repeat(1001),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th description is too long (1001), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_regex_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: Some("r".repeat(101)),
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields 0-th regex is too long (101), maximum is 100",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_fields_duplicate_key()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![
            FieldDef {
                key: "key1".to_owned(),
                kind: FieldKind::String as i32,
                format: None,
                required: false,
                description: "Key 1".to_owned(),
                regex: None,
                max_len: None,
            },
            FieldDef {
                key: "key1".to_owned(),
                kind: FieldKind::String as i32,
                format: None,
                required: false,
                description: "Key 1".to_owned(),
                regex: None,
                max_len: None,
            },
        ],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema schema fields duplicate 'key1'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_schema_missing() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: None,
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim schema is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_key_empty() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("".to_owned(), Vec::new());
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field '' can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_key_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("k".repeat(201), Vec::new());
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk' is too long (201), maximum is 200",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_value_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("key1".to_owned(), vec![255; 10001]);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'key1' value is too long (10001), maximum is 10000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_too_many() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: (0..1001)
                .into_iter()
                .map(|n| (format!("key{n}"), Vec::new()))
                .collect(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim too many fields (1001), maximum is 1000",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_key_unknown()
{
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("unknown".to_owned(), vec![0x0]);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'unknown' is not part of the schema",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_value_not_valid_string()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("key1".to_owned(), vec![0x80, 0xBF]);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'key1' is not a valid UTF-8 string",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_value_string_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: Some(1),
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("key1".to_owned(), vec![b'A'; 2]);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'key1' is too long according the schema, maximum is 1",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_value_invalid_integer()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::Int as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("key1".to_owned(), vec![b'A']);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'key1' is incorrectly sized (expected 8 bytes)",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_value_invalid_boolean()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::Bool as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("key1".to_owned(), vec![12]);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'key1' is invalid, expected 0x0 or 0x1",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_value_bytes_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::Bytes as i32,
            format: None,
            required: false,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: Some(1),
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: {
                let mut f = HashMap::new();
                f.insert("key1".to_owned(), vec![1, 2, 3]);
                f
            },
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field 'key1' is too long according the schema, maximum is 1",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_claim_fields_missing_required_value()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;

    let schema = VerificationSchema {
        name: "Testing Verification".to_owned(),
        description: "Testing verification".to_owned(),
        fields: vec![FieldDef {
            key: "key1".to_owned(),
            kind: FieldKind::String as i32,
            format: None,
            required: true,
            description: "Key 1".to_owned(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = schema.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };
    let serialized_schema = SerializedVerificationSchema {
        schema_bytes,
        digest: Some(digest),
    };
    let content = Content {
        content_body: Some(ContentBody::VerificationClaim(VerificationClaim {
            schema: Some(serialized_schema),
            fields: HashMap::new(),
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification claim field required field 'key1' missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_verify_collection() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    let content = Content {
        content_body: Some(ContentBody::VerificationVerify(
            VerificationVerify {
                claim_event_key: Some(event_key),
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '8'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_verify_claim_event_key_invalid()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    event_key.signed_by = None;
    let content = Content {
        content_body: Some(ContentBody::VerificationVerify(
            VerificationVerify {
                claim_event_key: Some(event_key),
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification verify claim event key signed by is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_verify_claim_event_key_wrong()
 {
    let mut client = TestClient::new().await;
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::VerificationVerify(
            VerificationVerify {
                claim_event_key: Some(event_key),
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification verify claim event key collection invalid, expected '8'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_verify_claim_event_key_missing()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::VerificationVerify(
            VerificationVerify {
                claim_event_key: None,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification verify claim event key is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_collection() {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: Some(event_key),
                target_identities: vec![client.identity().to_owned()],
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_INTERACTIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "event key collection invalid, expected '8'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_claim_event_key_invalid()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    event_key.signed_by = None;
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: Some(event_key),
                target_identities: vec![client.identity().to_owned()],
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification target claim event key signed by is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_claim_event_key_wrong()
 {
    let mut client = TestClient::new().await;
    let event_key = client.get_last_event_key();
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: Some(event_key),
                target_identities: vec![client.identity().to_owned()],
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification target claim event key collection invalid, expected '8'",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_claim_event_key_missing()
 {
    let mut client = TestClient::new().await;
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: None,
                target_identities: vec![client.identity().to_owned()],
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification target claim event key is missing",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_identities_empty()
{
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: Some(event_key),
                target_identities: Vec::new(),
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification target target identities can't be empty",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_identities_too_long()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    let identity = client.identity().to_owned();
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: Some(event_key),
                target_identities: {
                    let mut i = Vec::new();
                    i.resize(101, identity);
                    i
                },
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification target target identities is too long (101), maximum is 100",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_content_content_body_verification_target_identities_invalid()
 {
    let mut client = TestClient::new().await;
    let mut event_key = client.get_last_event_key();
    event_key.collection = COLLECTION_VERIFICATIONS;
    let content = Content {
        content_body: Some(ContentBody::VerificationTarget(
            VerificationTarget {
                claim_event_key: Some(event_key),
                target_identities: vec!["invalid000000000000000000000000000000000000000000000000000000000".to_owned()],
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = client.make_event(
        COLLECTION_VERIFICATIONS,
        Vec::new(),
        Vec::new(),
        digest,
        0,
    );
    client.push_event_bundle2(event, content_bytes);

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[],
        &[ExpectError {
            bundle_index: 1,
            kind: ExpectErrorKind::MsgContains(
                "content content body verification target target identities 0-th is not a valid identity",
            ),
        }],
    );
}

#[tokio::test]
async fn validation_passed_event_proofs() {
    let mut client = TestClient::new().await;
    client.pending.last_mut().unwrap().event_proofs =
        vec![EventProof::default()];

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "event proofs are not accepted when storing events",
            ),
        }],
        &[],
    );
}

#[tokio::test]
async fn validation_passed_meta() {
    let mut client = TestClient::new().await;
    client.pending.last_mut().unwrap().meta = Some(EventMetadata::default());

    let result = client.try_submit_events().await;
    expect_errors(
        result,
        &[ExpectError {
            bundle_index: 0,
            kind: ExpectErrorKind::MsgContains(
                "metadata not accepted when storing events",
            ),
        }],
        &[],
    );
}

#[derive(Debug)]
struct ExpectError {
    bundle_index: usize,
    kind: ExpectErrorKind,
}

#[derive(Debug)]
enum ExpectErrorKind {
    MsgContains(&'static str),
}

fn expect_errors(
    result: Result<(), SubmitErrors>,
    expected_errors: &[ExpectError],
    expected_warnings: &[ExpectError],
) {
    let Err(errors) = result else {
        panic!("unexpect OK result");
    };
    let SubmitErrors { errors, warnings } = errors;

    eprintln!("Got errors: {errors:#?}");
    eprintln!("Expected errors: {expected_errors:#?}");
    assert_eq!(errors.len(), expected_errors.len());
    for (got, expected) in errors.iter().zip(expected_errors) {
        assert_eq!(got.bundle_index, expected.bundle_index);
        match expected.kind {
            ExpectErrorKind::MsgContains(msg) => assert!(
                got.message.contains(msg),
                "unexpected message: '{}', expected '{}'",
                got.message,
                msg
            ),
        }
    }

    eprintln!("Got warnings: {warnings:#?}");
    eprintln!("Expected warnings: {expected_warnings:#?}");
    assert_eq!(warnings.len(), expected_warnings.len());
    for (got, expected) in warnings.iter().zip(expected_warnings) {
        assert_eq!(
            got.bundle_index, expected.bundle_index,
            "wrong bundle index"
        );
        match expected.kind {
            ExpectErrorKind::MsgContains(msg) => assert!(
                got.message.contains(msg),
                "unexpected message: '{}', expected '{}'",
                got.message,
                msg
            ),
        }
    }
}
