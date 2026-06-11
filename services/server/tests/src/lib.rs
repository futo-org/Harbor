pub mod proto;

use ed25519_dalek::{Signer, SigningKey};
use proto::event_sync_service_client::EventSyncServiceClient;
use proto::{
    Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey,
    EventProofTarget, Identity, KeyType, Post, PublicKey, RevocationBound,
    SerializedContent, SignedEvent, VectorClock, content,
};
use sha2::{Digest, Sha256};

pub const GRPC_ADDR: &str = "http://localhost:3000";

/// 2025-01-15T12:00:00Z in milliseconds.
pub const DEFAULT_CREATED_AT: u64 = 1736942400000;
pub const HOUR: u64 = 3_600_000;

pub const COLLECTION_IDENTITY: i32 = 1;
pub const COLLECTION_FEED: i32 = 2;

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
    EventSyncServiceClient::connect(GRPC_ADDR)
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
