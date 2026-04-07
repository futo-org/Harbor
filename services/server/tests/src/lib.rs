pub mod proto;

use ed25519_dalek::{Signer, SigningKey};
use proto::event_sync_service_client::EventSyncServiceClient;
use proto::{
    content, Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey, Identity,
    IdentityClaim, IdentityCreate, IdentityIssue, IdentityPermission, IdentityRevoke, KeyType,
    Post, PublicKey, SerializedContent, SignedEvent,
};
use sha2::{Digest, Sha256};

/// Default gRPC server address for tests
pub const GRPC_ADDR: &str = "http://localhost:50051";

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
    stream_id: &str,
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
            stream_id: stream_id.to_string(),
            signed_by: Some(PublicKey {
                key_type: KeyType::Ed25519.into(),
                key: public_key.as_bytes().to_vec(),
            }),
            sequence,
        }),
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

/// Build a signed event bundle with a Post content on a feed stream.
pub fn make_post_bundle(
    sequence: u64,
    signing_key: &SigningKey,
    text: &str,
    created_at: u64,
) -> EventBundle {
    make_bundle(
        "feed",
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

/// Serialize an Identity proto to bytes (used as identity_id everywhere).
pub fn make_identity_bytes(signing_key: &SigningKey, sequence: u64) -> Vec<u8> {
    let identity = Identity {
        public_key: Some(PublicKey {
            key_type: KeyType::Ed25519.into(),
            key: signing_key.verifying_key().as_bytes().to_vec(),
        }),
        sequence,
    };
    prost::Message::encode_to_vec(&identity)
}

/// Build an IdentityCreate bundle (signed by the identity's creator key).
pub fn make_identity_create_bundle(
    sequence: u64,
    signing_key: &SigningKey,
    identity_bytes: &[u8],
    created_at: u64,
) -> EventBundle {
    make_bundle(
        "identity",
        sequence,
        signing_key,
        Content {
            content_body: Some(content::ContentBody::IdentityCreate(IdentityCreate {
                identity: identity_bytes.to_vec(),
            })),
        },
        created_at,
    )
}

/// Build an IdentityIssue bundle (signed by an authorized key, issues to `target_key`).
pub fn make_identity_issue_bundle(
    sequence: u64,
    signing_key: &SigningKey,
    identity_bytes: &[u8],
    target_key: &SigningKey,
    created_at: u64,
) -> EventBundle {
    make_bundle(
        "identity",
        sequence,
        signing_key,
        Content {
            content_body: Some(content::ContentBody::IdentityIssue(IdentityIssue {
                identity: identity_bytes.to_vec(),
                public_key: Some(PublicKey {
                    key_type: KeyType::Ed25519.into(),
                    key: target_key.verifying_key().as_bytes().to_vec(),
                }),
                permissions: vec![IdentityPermission::All.into()],
            })),
        },
        created_at,
    )
}

/// Build an IdentityClaim bundle (signed by the key claiming membership).
pub fn make_identity_claim_bundle(
    sequence: u64,
    signing_key: &SigningKey,
    identity_bytes: &[u8],
    created_at: u64,
) -> EventBundle {
    make_bundle(
        "identity",
        sequence,
        signing_key,
        Content {
            content_body: Some(content::ContentBody::IdentityClaim(IdentityClaim {
                identity: identity_bytes.to_vec(),
            })),
        },
        created_at,
    )
}

/// Build an IdentityRevoke bundle (signed by an authorized key, revokes `target_key`).
pub fn make_identity_revoke_bundle(
    sequence: u64,
    signing_key: &SigningKey,
    identity_bytes: &[u8],
    target_key: &SigningKey,
    created_at: u64,
) -> EventBundle {
    make_bundle(
        "identity",
        sequence,
        signing_key,
        Content {
            content_body: Some(content::ContentBody::IdentityRevoke(IdentityRevoke {
                identity: identity_bytes.to_vec(),
                public_key: Some(PublicKey {
                    key_type: KeyType::Ed25519.into(),
                    key: target_key.verifying_key().as_bytes().to_vec(),
                }),
            })),
        },
        created_at,
    )
}
