pub mod proto;

use ed25519_dalek::{Signer, SigningKey};
use proto::event_sync_service_client::EventSyncServiceClient;
use proto::{
    content, Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey, KeyType,
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

/// Build a signed event bundle with a Post content, using a real ed25519 signature.
pub fn make_post_bundle(
    stream_id: &str,
    sequence: u64,
    signing_key: &SigningKey,
    text: &str,
) -> EventBundle {
    let public_key = signing_key.verifying_key();

    let content = Content {
        content_body: Some(content::ContentBody::Post(Post {
            text: text.to_string(),
            reply: None,
        })),
    };

    // Serialize the Content message — this is what the digest is computed over
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
        created_at: 1000,
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
