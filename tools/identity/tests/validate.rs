//! End-to-end: build an identity chain with the tool, then validate every
//! event against the real `polycentric-core` validator.

use polycentric_common::models::collections::{IDENTITY, PROFILE};
use polycentric_common::models::protos_v2::{
    content::ContentBody, Content, EventBundle, SerializedContent,
};
use polycentric_core::client::PolycentricClient;
use polycentric_identity::{IdentityStore, KeyKind};
use prost::Message;

#[test]
fn generated_identity_chain_validates_against_core() {
    let dir = std::env::temp_dir().join(format!("polyid-validate-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);

    // Build a chain: genesis + rotation + 2 signing, then revoke one signing
    // key. Publish a profile name on top.
    let mut store = IdentityStore::open(&dir).unwrap();
    let identity = store.create_identity().unwrap();
    store.add_key(KeyKind::Rotation).unwrap();
    let signing = store.add_key(KeyKind::Signing).unwrap();
    store.add_key(KeyKind::Signing).unwrap();
    store.revoke_key(&signing.public_hex()).unwrap();
    store.set_profile_name("Test User").unwrap();

    let exported = store.export().unwrap();
    assert_eq!(exported.len(), 6, "genesis + 3 adds + 1 revoke + 1 profile");

    // Feed the chain (events + content) into a fresh validator.
    let bundles: Vec<EventBundle> = exported
        .into_iter()
        .map(|e| EventBundle {
            signed_event: Some(e.signed_event),
            serialized_content: Some(SerializedContent {
                content_bytes: e.content,
            }),
            event_proofs: vec![],
            meta: None,
        })
        .collect();
    let mut client = PolycentricClient::new();
    client.copy_bundles(bundles);

    // Every event must validate as part of the identity chain.
    for sequence in 1..=5u64 {
        assert!(
            client
                .find_event_bundle_by_sequence(&identity, IDENTITY, sequence, None)
                .is_some(),
            "identity event at sequence {sequence} failed to validate against polycentric-core"
        );
    }

    // The profile event must validate too, and carry the published name.
    let profiles = client.list_valid_events(&identity, PROFILE).unwrap();
    assert_eq!(profiles.len(), 1, "profile event failed to validate");
    let content_bytes = &profiles[0]
        .serialized_content
        .as_ref()
        .expect("profile content should be stored")
        .content_bytes;
    let decoded = Content::decode(content_bytes.as_slice()).unwrap();
    let Some(ContentBody::ProfileUpdate(update)) = decoded.content_body else {
        panic!("expected a profile update");
    };
    assert_eq!(update.name.as_deref(), Some("Test User"));
    assert_eq!(store.profile().unwrap().unwrap().name.as_deref(), Some("Test User"));

    // The revoked signing key must be gone from the current document, which
    // must also record the revocation.
    let doc = store.current_doc().unwrap();
    let revoked = hex::decode(signing.public_hex()).unwrap();
    assert!(!doc.signing_keys.iter().any(|k| k.key == revoked));
    assert_eq!(doc.revocation_bounds.len(), 1);

    let _ = std::fs::remove_dir_all(&dir);
}
