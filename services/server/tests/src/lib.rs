pub mod proto;

use ed25519_dalek::{Signer, SigningKey};
use proto::event_sync_service_client::EventSyncServiceClient;
use proto::feeds_service_client::FeedsServiceClient;
use proto::{
    Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey,
    EventProofTarget, FieldDef, FieldKind, Identity, KeyType, Labels, Post,
    PublicKey, RevocationBound, SerializedContent,
    SerializedVerificationSchema, SignedEvent, VectorClock, VerificationClaim,
    VerificationSchema, content,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// gRPC server address. Override with `POLYCENTRIC_TEST_SERVER` env var.
pub fn grpc_addr() -> String {
    std::env::var("POLYCENTRIC_TEST_SERVER")
        .unwrap_or_else(|_| "http://localhost:3000".to_string())
}

/// 2025-01-15T12:00:00Z in milliseconds.
pub const DEFAULT_CREATED_AT: u64 = 1736942400000;
pub const HOUR: u64 = 3_600_000;

pub const COLLECTION_IDENTITY: i32 = 1;
pub const COLLECTION_FEED: i32 = 2;
pub const COLLECTION_VERIFICATIONS: i32 = 8;
pub const COLLECTION_LABELS: i32 = 7;

pub fn sha256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub async fn connect_event_sync()
-> EventSyncServiceClient<tonic::transport::Channel> {
    EventSyncServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server")
}

pub async fn connect_feeds() -> FeedsServiceClient<tonic::transport::Channel> {
    FeedsServiceClient::connect(grpc_addr())
        .await
        .expect("failed to connect to gRPC server")
}

pub fn generate_signing_key() -> SigningKey {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("OS random number generator failed");
    SigningKey::from_bytes(&bytes)
}

pub fn public_key_of(key: &SigningKey) -> PublicKey {
    PublicKey {
        key_type: KeyType::Ed25519.into(),
        key: key.verifying_key().as_bytes().to_vec(),
    }
}

/// Identity string = hex(sha256(encoded initial Identity content)).
pub fn derive_identity_string(initial: &Identity) -> String {
    hex(&sha256(&prost::Message::encode_to_vec(initial)))
}

fn content_with_digest(content: Content) -> (Vec<u8>, ContentDigest) {
    let bytes = prost::Message::encode_to_vec(&content);
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&bytes),
    };
    (bytes, digest)
}

fn sign(signing_key: &SigningKey, event: Event) -> SignedEvent {
    let event_bytes = prost::Message::encode_to_vec(&event);
    let signature = signing_key.sign(&event_bytes).to_bytes().to_vec();
    SignedEvent {
        signature,
        event_bytes,
    }
}

#[allow(clippy::too_many_arguments)]
fn make_event(
    collection: i32,
    identity: &str,
    signing_key: &SigningKey,
    sequence: u64,
    identity_sequence: u64,
    vector_clock: VectorClock,
    previous_signature: Vec<u8>,
    previous_root: Vec<u8>,
    digest: ContentDigest,
    created_at: u64,
) -> Event {
    Event {
        key: Some(EventKey {
            collection,
            identity: identity.to_string(),
            signed_by: Some(public_key_of(signing_key)),
            sequence,
        }),
        identity_sequence,
        vector_clock: Some(vector_clock),
        previous_signature,
        previous_root,
        content_digest: Some(digest),
        created_at,
    }
}

fn bundle(signed_event: SignedEvent, content_bytes: Vec<u8>) -> EventBundle {
    EventBundle {
        signed_event: Some(signed_event),
        serialized_content: Some(SerializedContent { content_bytes }),
        event_proofs: vec![],
        meta: None,
    }
}

/// Build a signed identity-collection bundle.
#[allow(clippy::too_many_arguments)]
pub fn make_identity_bundle(
    identity: &str,
    signing_key: &SigningKey,
    sequence: u64,
    identity_sequence: u64,
    vector_clock: Vec<u64>,
    identity_content: Identity,
    created_at: u64,
) -> EventBundle {
    let content = Content {
        content_body: Some(content::ContentBody::Identity(identity_content)),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = make_event(
        COLLECTION_IDENTITY,
        identity,
        signing_key,
        sequence,
        identity_sequence,
        VectorClock {
            sequence: vector_clock,
        },
        vec![],
        vec![],
        digest,
        created_at,
    );
    bundle(sign(signing_key, event), content_bytes)
}

/// Build a signed feed-collection post bundle with `previous_root` set to
/// the MMR root over the signer's prior FEED events.
#[allow(clippy::too_many_arguments)]
pub fn make_post_bundle(
    identity: &str,
    signing_key: &SigningKey,
    sequence: u64,
    identity_sequence: u64,
    vector_clock: Vec<u64>,
    previous_root: Vec<u8>,
    text: &str,
    created_at: u64,
) -> EventBundle {
    let content = Content {
        content_body: Some(content::ContentBody::Post(Post {
            text: text.to_string(),
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = make_event(
        COLLECTION_FEED,
        identity,
        signing_key,
        sequence,
        identity_sequence,
        VectorClock {
            sequence: vector_clock,
        },
        vec![],
        previous_root,
        digest,
        created_at,
    );
    bundle(sign(signing_key, event), content_bytes)
}

/// Build a signed verification-claim bundle carrying a one-field schema
/// (`handle`) and a value for it.
pub fn make_verification_claim_bundle(
    identity: &str,
    signing_key: &SigningKey,
    sequence: u64,
    identity_sequence: u64,
    vector_clock: Vec<u64>,
    handle: &str,
    created_at: u64,
) -> EventBundle {
    let schema = VerificationSchema {
        name: "X Verification".to_string(),
        description: String::new(),
        fields: vec![FieldDef {
            key: "handle".to_string(),
            kind: FieldKind::String as i32,
            format: String::new(),
            required: true,
            description: "Handle".to_string(),
            regex: None,
            max_len: None,
        }],
    };
    let schema_bytes = prost::Message::encode_to_vec(&schema);
    let schema_digest = ContentDigest {
        r#type: ContentDigestType::Sha256.into(),
        value: sha256(&schema_bytes),
    };

    let mut fields = HashMap::new();
    fields.insert("handle".to_string(), handle.as_bytes().to_vec());

    let content = Content {
        content_body: Some(content::ContentBody::VerificationClaim(
            VerificationClaim {
                schema: Some(SerializedVerificationSchema {
                    schema_bytes,
                    digest: Some(schema_digest),
                }),
                fields,
            },
        )),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = make_event(
        COLLECTION_VERIFICATIONS,
        identity,
        signing_key,
        sequence,
        identity_sequence,
        VectorClock {
            sequence: vector_clock,
        },
        vec![],
        vec![],
        digest,
        created_at,
    );
    bundle(sign(signing_key, event), content_bytes)
}

/// RFC 6962 leaf hash: `SHA256(0x00 || data)`. Mirrors `polycentric_common::merkle`.
pub fn leaf_hash(data: &[u8]) -> Vec<u8> {
    let mut h = Sha256::new();
    h.update([0x00u8]);
    h.update(data);
    h.finalize().to_vec()
}

/// RFC 6962 internal node hash: `SHA256(0x01 || left || right)`.
pub fn node_hash(left: &[u8], right: &[u8]) -> Vec<u8> {
    let mut h = Sha256::new();
    h.update([0x01u8]);
    h.update(left);
    h.update(right);
    h.finalize().to_vec()
}

/// Build a revocation bound for a single revoked signer with one collection.
pub fn make_revocation_bound(
    revoked_key: &SigningKey,
    collection: i32,
    head_signature: Vec<u8>,
    head_root: Vec<u8>,
    leaf_count: u64,
) -> RevocationBound {
    RevocationBound {
        revoked_key: Some(public_key_of(revoked_key)),
        targets: vec![EventProofTarget {
            collection,
            signature: head_signature,
            root: head_root,
            leaf_count,
        }],
    }
}

/// Read the signature out of a freshly-built bundle (panics on a malformed bundle).
pub fn bundle_signature(b: &EventBundle) -> Vec<u8> {
    b.signed_event
        .as_ref()
        .expect("bundle missing signed_event")
        .signature
        .clone()
}

/// Deterministic signing key for the test moderator. The server must be
/// started with `POLYCENTRIC_MODERATION_IDENTITY` set to
/// [`test_moderator_identity()`] for these tests to pass.
pub fn test_moderator_key() -> SigningKey {
    let seed = sha256(b"polycentric-test-moderator-seed-2026");
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&seed[..32]);
    SigningKey::from_bytes(&bytes)
}

/// Identity string of the test moderator — the value that must be set as
/// `POLYCENTRIC_MODERATION_IDENTITY` when starting the server.
pub fn test_moderator_identity() -> String {
    let key = test_moderator_key();
    let initial = Identity {
        rotation_keys: vec![public_key_of(&key)],
        signing_keys: vec![],
        revocation_bounds: vec![],
    };
    derive_identity_string(&initial)
}

/// Build a signed Labels-collection (collection 7) event bundle targeting
/// `target_event_key` with the given label values.
#[allow(clippy::too_many_arguments)]
pub fn make_labels_bundle(
    identity: &str,
    signing_key: &SigningKey,
    sequence: u64,
    identity_sequence: u64,
    vector_clock: Vec<u64>,
    previous_root: Vec<u8>,
    target_event_key: EventKey,
    label_values: Vec<String>,
    created_at: u64,
) -> EventBundle {
    let content = Content {
        content_body: Some(content::ContentBody::Labels(Labels {
            event_key: Some(target_event_key),
            label_values,
        })),
    };
    let (content_bytes, digest) = content_with_digest(content);
    let event = make_event(
        COLLECTION_LABELS,
        identity,
        signing_key,
        sequence,
        identity_sequence,
        VectorClock {
            sequence: vector_clock,
        },
        vec![],
        previous_root,
        digest,
        created_at,
    );
    bundle(sign(signing_key, event), content_bytes)
}
