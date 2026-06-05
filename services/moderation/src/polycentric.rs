use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use ed25519_dalek::{Signer, SigningKey};
use log::{info, warn};
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey, KeyType, Labels,
    ListEventsFilters, ListEventsRequest, PublicKey, PutEventsRequest, SerializedContent,
    SignedEvent, content::ContentBody, event_sync_service_client::EventSyncServiceClient,
};
// rs-core's client manages the local event/content stores and chain math.
use polycentric_core::client::PolycentricClient as CoreClient;
use polycentric_core::query::channel;
use prost::Message;
use sha2::{Digest, Sha256};

/// Failure while publishing a labels event.
pub enum PublishError {
    /// The service's identity state is not available (e.g. the identity
    /// chain was never loaded). The caller should retry rather than drop
    /// the label.
    NotReady(String),
    /// A transient failure (network/server). Retrying may succeed.
    Transient(String),
}

impl std::fmt::Display for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PublishError::NotReady(m) => write!(f, "not ready: {m}"),
            PublishError::Transient(m) => write!(f, "transient: {m}"),
        }
    }
}

/// Chain position for the next event we author in a collection, read from
/// the durable Postgres store (not local in-memory state) so that multiple
/// moderation processes extend a single, shared chain consistently.
pub struct ChainHead {
    /// Sequence to assign the next event (`max(sequence) + 1`, or 1).
    pub next_sequence: u64,
    /// Canonically-latest signature in the collection (empty if none).
    pub previous_signature: Vec<u8>,
    /// Merkle root over the collection's canonical signatures (empty if none).
    pub previous_root: Vec<u8>,
}

/// Signed event and content that should persist to the database.
pub struct CreatedEvent {
    /// The decoded event (carries key, digest, previous_root, etc.).
    pub event: Event,
    /// Signature over `event_bytes`.
    pub signature: Vec<u8>,
    /// Canonical serialized `Event` (the bytes that were signed).
    pub event_bytes: Vec<u8>,
    /// Serialized `Content` message.
    pub content_bytes: Vec<u8>,
}

pub struct PolycentricClient {
    signing_key: SigningKey,
    public_key: PublicKey,
    /// Hex identity string this service publishes under.
    identity: String,
    /// gRPC server URLs to bootstrap from and publish to.
    servers: Vec<String>,
    /// Sequence of our identity chain's head, learned at bootstrap. Used as
    /// the `identity_sequence` of events we author (it references the
    /// identity document that authorizes our signing key).
    identity_sequence: AtomicU64,
    /// In-memory mirror of our identity + labels events, used to compute
    /// sequence/vector-clock/root for the next event.
    core: Mutex<CoreClient>,
}

impl PolycentricClient {
    /// Build from the environment:
    /// - `POLYCENTRIC_MODERATION_SIGNING_KEY` — hex 32-byte ed25519 seed.
    /// - `POLYCENTRIC_MODERATION_IDENTITY` — hex identity string.
    /// - `POLYCENTRIC_MODERATION_SERVERS` — comma-separated gRPC URLs.
    pub fn from_env() -> Result<Self, String> {
        let seed_hex = std::env::var("POLYCENTRIC_MODERATION_SIGNING_KEY")
            .map_err(|_| "POLYCENTRIC_MODERATION_SIGNING_KEY is not set".to_string())?;
        let seed = decode_hex_32(seed_hex.trim())?;
        let signing_key = SigningKey::from_bytes(&seed);
        let public_key = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: signing_key.verifying_key().to_bytes().to_vec(),
        };

        let identity = std::env::var("POLYCENTRIC_MODERATION_IDENTITY")
            .map_err(|_| "POLYCENTRIC_MODERATION_IDENTITY is not set".to_string())?
            .trim()
            .to_string();
        if identity.is_empty() {
            return Err("POLYCENTRIC_MODERATION_IDENTITY is empty".to_string());
        }

        let servers: Vec<String> = std::env::var("POLYCENTRIC_MODERATION_SERVERS")
            .map_err(|_| "POLYCENTRIC_MODERATION_SERVERS is not set".to_string())?
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if servers.is_empty() {
            return Err("POLYCENTRIC_MODERATION_SERVERS is empty".to_string());
        }

        Ok(Self {
            signing_key,
            public_key,
            identity,
            servers,
            identity_sequence: AtomicU64::new(0),
            core: Mutex::new(CoreClient::new()),
        })
    }

    /// Load  identity chain (collection 1) and any labels we've already
    /// published (collection 7) from every server into the local client
    pub async fn bootstrap(&self) {
        for server in &self.servers {
            match self.fetch_identity_state(server).await {
                Ok(count) => info!("bootstrap: loaded {count} bundles from {server}"),
                Err(e) => warn!("bootstrap: failed to load identity state from {server}: {e}"),
            }
        }
        if self.identity_sequence.load(Ordering::Relaxed) == 0 {
            warn!(
                "bootstrap: no identity events found for {} on any server; \
                 label publishing will be skipped until the identity is available",
                self.identity
            );
        }
    }

    async fn fetch_identity_state(&self, server: &str) -> Result<usize, String> {
        let chan = channel(server)?;
        let mut client = EventSyncServiceClient::new(chan);

        let mut bundles = Vec::new();
        for collection in [collections::IDENTITY, collections::LABELS] {
            let response = client
                .list_events(ListEventsRequest {
                    filters: Some(ListEventsFilters {
                        collection: Some(collection),
                        identity: Some(self.identity.clone()),
                        ..Default::default()
                    }),
                    size: None,
                })
                .await
                .map_err(|e| format!("list_events(collection={collection}): {e}"))?;
            bundles.extend(response.into_inner().event_bundles);
        }

        // Learn the identity head sequence (max sequence among identity
        // events) so we can reference it as `identity_sequence`.
        let head = max_identity_sequence(&bundles);
        if head > 0 {
            self.identity_sequence.fetch_max(head, Ordering::Relaxed);
        }

        let count = bundles.len();
        self.core.lock().unwrap().copy_bundles(bundles);
        Ok(count)
    }

    /// The hex identity string this service publishes under.
    pub fn identity(&self) -> &str {
        &self.identity
    }

    /// The public key this service signs events with.
    pub fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    /// Build, sign, and push a `Labels` event for `target`.
    pub async fn publish_labels(
        &self,
        target: EventKey,
        label_values: Vec<String>,
        head: ChainHead,
    ) -> Result<CreatedEvent, PublishError> {
        let identity_sequence = self.identity_sequence.load(Ordering::Relaxed);
        if identity_sequence == 0 {
            return Err(PublishError::NotReady(
                "identity state not loaded".to_string(),
            ));
        }

        let (content_bytes, digest) = labels_content(&target, &label_values);

        // The sequence and prior-chain references come from the durable
        // Postgres store (`head`); only the vector clock is derived locally,
        // from the static identity chain loaded at bootstrap.
        let sequence = head.next_sequence;
        let vector_clock = {
            let core = self.core.lock().unwrap();
            core.build_vector_clock(
                &self.identity,
                collections::LABELS,
                identity_sequence,
                &self.public_key,
                sequence,
                None,
            )
            .map_err(|e| PublishError::NotReady(e.to_string()))?
        };

        let event = Event {
            key: Some(EventKey {
                collection: collections::LABELS,
                identity: self.identity.clone(),
                signed_by: Some(self.public_key.clone()),
                sequence,
            }),
            identity_sequence,
            vector_clock: Some(vector_clock),
            previous_signature: head.previous_signature,
            previous_root: head.previous_root,
            content_digest: Some(digest),
            created_at: now_millis(),
        };

        let event_bytes = event.encode_to_vec();
        let signature = self.signing_key.sign(&event_bytes).to_bytes().to_vec();
        let signed_event = SignedEvent {
            signature: signature.clone(),
            event_bytes: event_bytes.clone(),
        };
        let bundle = EventBundle {
            signed_event: Some(signed_event),
            serialized_content: Some(SerializedContent {
                content_bytes: content_bytes.clone(),
            }),
            event_proofs: vec![],
        };

        // Push to every server; success on any is enough to consider it
        // published (servers gossip among themselves).
        let request = PutEventsRequest {
            event_bundles: vec![bundle],
        };
        let mut pushed = false;
        for server in &self.servers {
            match put_events(server, request.clone()).await {
                Ok(()) => pushed = true,
                Err(e) => warn!("publish: put_events to {server} failed: {e}"),
            }
        }
        if !pushed {
            return Err(PublishError::Transient(
                "failed to push labels event to any server".to_string(),
            ));
        }

        // No local state to update: the next event's chain position is read
        // back from Postgres once the caller persists this one.
        Ok(CreatedEvent {
            event,
            signature,
            event_bytes,
            content_bytes,
        })
    }
}

/// Highest sequence among the identity-collection events in `bundles`.
fn max_identity_sequence(bundles: &[EventBundle]) -> u64 {
    bundles
        .iter()
        .filter_map(|b| b.signed_event.as_ref())
        .filter_map(|se| Event::decode(se.event_bytes.as_slice()).ok())
        .filter_map(|e| e.key)
        .filter(|k| k.collection == collections::IDENTITY)
        .map(|k| k.sequence)
        .max()
        .unwrap_or(0)
}

/// Push a request to a single server, treating any per-event error the
/// server reports for our event as a failure.
async fn put_events(server: &str, request: PutEventsRequest) -> Result<(), String> {
    let chan = channel(server)?;
    let mut client = EventSyncServiceClient::new(chan);
    let response = client
        .put_events(request)
        .await
        .map_err(|e| format!("put_events: {e}"))?;
    let errors = response.into_inner().errors;
    if !errors.is_empty() {
        let messages: Vec<&str> = errors.iter().map(|e| e.message.as_str()).collect();
        return Err(format!("server rejected event: {messages:?}"));
    }
    Ok(())
}

/// Build the serialized `Labels` content for `target`/`label_values` and
/// its digest.
pub fn labels_content(target: &EventKey, label_values: &[String]) -> (Vec<u8>, ContentDigest) {
    let content = Content {
        content_body: Some(ContentBody::Labels(Labels {
            event_key: Some(target.clone()),
            label_values: label_values.to_vec(),
        })),
    };
    let content_bytes = content.encode_to_vec();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256 as i32,
        value: sha256(&content_bytes),
    };
    (content_bytes, digest)
}

fn sha256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Current wall-clock time in milliseconds since the Unix epoch.
fn now_millis() -> u64 {
    let now = time::OffsetDateTime::now_utc();
    (now.unix_timestamp_nanos() / 1_000_000) as u64
}

/// Decode a 64-character hex string into 32 bytes.
fn decode_hex_32(s: &str) -> Result<[u8; 32], String> {
    if s.len() != 64 {
        return Err(format!(
            "signing key must be 64 hex chars (32 bytes), got {}",
            s.len()
        ));
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16)
            .map_err(|e| format!("invalid hex in signing key: {e}"))?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_hex_32_roundtrip() {
        let bytes = [0xABu8; 32];
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(decode_hex_32(&hex).unwrap(), bytes);
    }

    #[test]
    fn decode_hex_32_rejects_wrong_length() {
        assert!(decode_hex_32("abcd").is_err());
    }

    #[test]
    fn decode_hex_32_rejects_non_hex() {
        assert!(decode_hex_32(&"z".repeat(64)).is_err());
    }
}
