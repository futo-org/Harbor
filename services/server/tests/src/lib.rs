pub mod proto;

use ed25519_dalek::{Signer, SigningKey};
use proto::event_sync_service_client::EventSyncServiceClient;
use proto::{
    content, Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey, Identity,
    KeyType, Post, PublicKey, SerializedContent, SignedEvent,
};
use sha2::{Digest, Sha256};

pub const GRPC_ADDR: &str = "http://localhost:3000";

pub fn sha256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

pub async fn connect_event_sync() -> EventSyncServiceClient<tonic::transport::Channel> {
    EventSyncServiceClient::connect(GRPC_ADDR)
        .await
        .expect("failed to connect to gRPC server")
}

/// Generate a random ed25519 signing key.
pub fn generate_signing_key() -> SigningKey {
    let mut rng = rand::thread_rng();
    SigningKey::generate(&mut rng)
}

/// 2025-01-15T12:00:00Z in milliseconds
pub const DEFAULT_CREATED_AT: u64 = 1736942400000;

/// Build a signed EventBundle from arbitrary Content.
fn make_bundle(
    collection: i32,
    identity: &str,
    sequence: u64,
    signing_key: &SigningKey,
    content: Content,
    created_at: u64,
) -> EventBundle {
    let public_key = signing_key.verifying_key();

    let content_bytes = prost::Message::encode_to_vec(&content);
    let content_digest = sha256(&content_bytes);

    let event = Event {
        key: Some(EventKey {
            collection,
            identity: identity.to_string(),
            signed_by: Some(PublicKey {
                key_type: KeyType::Ed25519.into(),
                key: public_key.as_bytes().to_vec(),
            }),
            sequence,
        }),
        vector_clock: None,
        previous_signature: vec![],
        content_digest: Some(ContentDigest {
            r#type: ContentDigestType::Sha256.into(),
            value: content_digest,
        }),
        created_at,
    };

    let event_bytes = prost::Message::encode_to_vec(&event);
    let signature = signing_key.sign(&event_bytes);

    EventBundle {
        signed_event: Some(SignedEvent {
            signature: signature.to_bytes().to_vec(),
            event_bytes,
        }),
        serialized_content: Some(SerializedContent { content_bytes }),
    }
}

/// Compute an identity key (hex-encoded sha256 of the initial Identity content bytes).
pub fn make_identity_key(rotation_key: &SigningKey) -> String {
    let identity = Identity {
        rotation_keys: vec![PublicKey {
            key_type: KeyType::Ed25519.into(),
            key: rotation_key.verifying_key().as_bytes().to_vec(),
        }],
        signing_keys: vec![],
    };
    let identity_bytes = prost::Message::encode_to_vec(&identity);
    hex::encode(sha256(&identity_bytes))
}

/// Build a signed event bundle with a Post content on a feed stream.
pub fn make_post_bundle(
    identity: &str,
    sequence: u64,
    signing_key: &SigningKey,
    text: &str,
    created_at: u64,
) -> EventBundle {
    make_bundle(
        2, // Feed collection
        identity,
        sequence,
        signing_key,
        Content {
            content_body: Some(content::ContentBody::Post(Post {
                text: text.to_string(),
                reply: None,
            })),
        },
        created_at,
    )
}

/// Build an Identity bundle with the given rotation and signing keys.
pub fn make_identity_bundle(
    identity: &str,
    sequence: u64,
    signing_key: &SigningKey,
    rotation_keys: Vec<PublicKey>,
    signing_keys: Vec<PublicKey>,
    created_at: u64,
) -> EventBundle {
    make_bundle(
        1, // Identity collection
        identity,
        sequence,
        signing_key,
        Content {
            content_body: Some(content::ContentBody::Identity(Identity {
                rotation_keys,
                signing_keys,
            })),
        },
        created_at,
    )
}
