use integration_tests::proto::{
    Identity, ListEventsFilters, ListEventsRequest, PutEventsRequest,
};
use integration_tests::{
    COLLECTION_FEED, COLLECTION_VERIFICATIONS, DEFAULT_CREATED_AT, HOUR,
    bundle_signature, connect_event_sync, derive_identity_string,
    generate_signing_key, leaf_hash, make_identity_bundle, make_post_bundle,
    make_revocation_bound, make_verification_claim_bundle, node_hash,
    public_key_of,
};

#[tokio::test]
async fn list_events_empty_works() {
    let mut client = connect_event_sync().await;
    let response = client
        .list_events(ListEventsRequest {
            size: Some(10),
            ..Default::default()
        })
        .await
        .expect("list_events failed");
    // No assertion on count — server may have prior state — just that the
    // call succeeds and decodes.
    let _ = response.into_inner().event_bundles;
}

#[tokio::test]
async fn put_then_list_round_trip() {
    let mut client = connect_event_sync().await;
    let rotation_key = generate_signing_key();

    let initial = Identity {
        rotation_keys: vec![public_key_of(&rotation_key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
    };
    let identity = derive_identity_string(&initial);

    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        initial,
        DEFAULT_CREATED_AT,
    );
    let post = make_post_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        vec![],
        "hello",
        DEFAULT_CREATED_AT + HOUR,
    );
    let post_signature = bundle_signature(&post);

    client
        .put_events(PutEventsRequest {
            event_bundles: vec![genesis, post],
        })
        .await
        .expect("put_events failed");

    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity),
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
    };
    let identity = derive_identity_string(&initial);

    let mut bundle = make_post_bundle(
        &identity,
        &key,
        1,
        1,
        vec![1],
        vec![],
        "tampered",
        DEFAULT_CREATED_AT,
    );
    if let Some(ref mut signed) = bundle.signed_event {
        signed.signature[0] ^= 0xFF;
    }

    let err = client
        .put_events(PutEventsRequest {
            event_bundles: vec![bundle],
        })
        .await
        .expect_err("tampered signature must be rejected");
    assert_eq!(err.code(), tonic::Code::Unauthenticated);
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
    };
    let identity = derive_identity_string(&initial);

    // Genesis identity event signed by A. Dedup keys = [A, B]; VC = [1, 0].
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        DEFAULT_CREATED_AT,
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
        DEFAULT_CREATED_AT + HOUR,
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
        DEFAULT_CREATED_AT + 2 * HOUR,
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
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked_content,
        DEFAULT_CREATED_AT + 3 * HOUR,
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
                identity: Some(identity),
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
    };
    let identity = derive_identity_string(&initial);

    // Genesis.
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        DEFAULT_CREATED_AT,
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
        DEFAULT_CREATED_AT + HOUR,
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
        DEFAULT_CREATED_AT + 2 * HOUR,
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
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked,
        DEFAULT_CREATED_AT + 3 * HOUR,
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
        vec![],
        "post-revocation post",
        DEFAULT_CREATED_AT + 4 * HOUR,
    );
    let sig_3 = bundle_signature(&post_3);
    client
        .put_events(PutEventsRequest {
            event_bundles: vec![post_3],
        })
        .await
        .expect("post_3 put failed");

    // List events.
    let response = client
        .list_events(ListEventsRequest {
            size: Some(100),
            filters: Some(ListEventsFilters {
                identity: Some(identity),
                ..Default::default()
            }),
        })
        .await
        .expect("list_events failed");
    let bundles = response.into_inner().event_bundles;

    // post_3 is present (server doesn't filter on revocation status).
    let bundle_3 = bundles
        .iter()
        .find(|b| {
            b.signed_event
                .as_ref()
                .map(|se| se.signature == sig_3)
                .unwrap_or(false)
        })
        .expect("post_3 missing from list_events response");

    // …but it carries no proof — it's not in the head's committed tree.
    assert!(
        bundle_3.event_proofs.is_empty(),
        "post-revocation event must not carry a forged EventProof; got {} proofs",
        bundle_3.event_proofs.len(),
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
    };
    let identity = derive_identity_string(&initial);

    // Genesis.
    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1, 0],
        initial.clone(),
        DEFAULT_CREATED_AT,
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
        DEFAULT_CREATED_AT + HOUR,
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
        DEFAULT_CREATED_AT + 2 * HOUR,
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
        DEFAULT_CREATED_AT + 3 * HOUR,
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
        DEFAULT_CREATED_AT + 2 * HOUR,
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
    };
    let rotation = make_identity_bundle(
        &identity,
        &rotation_key,
        2,
        1,
        vec![2, 0],
        revoked,
        DEFAULT_CREATED_AT + 4 * HOUR,
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
                identity: Some(identity.clone()),
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
            DEFAULT_CREATED_AT + 2 * HOUR,
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
    };
    let identity = derive_identity_string(&initial);

    let genesis = make_identity_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        initial,
        DEFAULT_CREATED_AT,
    );
    let claim = make_verification_claim_bundle(
        &identity,
        &rotation_key,
        1,
        1,
        vec![1],
        "alice",
        DEFAULT_CREATED_AT + HOUR,
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
                identity: Some(identity),
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
    );
}
