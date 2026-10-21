//! Creating v2 identities and authoring/pushing their events with the single
//! master key.
//!
//! Each legacy system gets a genesis `Identity` document listing the master key
//! as the primary rotation key and the legacy system key as an additional
//! rotation key. Because the identity string is `SHA256(Identity)`
//! ([`Identity::derive_hex_key`]) and the legacy key differs per system, every
//! migrated identity is distinct even though one master key signs them all. The
//! legacy key being a rotation key lets the real owner later publish an identity
//! update and take the account over.

use ed25519_dalek::{Signer, SigningKey};
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Application, Content, ContentDigest, ContentDigestType, Event, EventBundle, EventKey, Identity,
    KeyType, PublicKey, SerializedContent, ServerList, SignedEvent, VectorClock,
    content::ContentBody,
};
use polycentric_common::models::validate::Validate;
use polycentric_core::sync as core_sync;
use prost::Message;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::Duration;

/// The gRPC channel has no timeout of its own.
const PUSH_TIMEOUT: Duration = Duration::from_secs(60);

/// Stamped on every migrated event's `Event.application`, marking its origin.
/// Legacy events carry no app version; "v1" names the Polycentric version
/// they were authored under. Changing it changes every event's bytes.
fn grayjay_application() -> Application {
    Application {
        name: "Grayjay".to_string(),
        id: "com.futo.platformplayer".to_string(),
        version: "v1".to_string(),
        url: "https://grayjay.app".to_string(),
    }
}

/// RFC 6962 Merkle tree head, maintained **incrementally** so `previous_root`
/// is O(log n) per event instead of rebuilding the whole tree each time
/// (which made authoring a heavy chain O(n^2)). Matches
/// `polycentric_common::merkle::merkle_tree_hash` (verified in tests).
#[derive(Default)]
struct IncrementalMerkle {
    /// Perfect-subtree peaks (size, hash), strictly decreasing size front→back.
    peaks: Vec<(usize, [u8; 32])>,
}

impl IncrementalMerkle {
    fn leaf_hash(data: &[u8]) -> [u8; 32] {
        let mut h = Sha256::new();
        h.update([0x00u8]); // RFC 6962 leaf prefix
        h.update(data);
        h.finalize().into()
    }

    fn node_hash(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
        let mut h = Sha256::new();
        h.update([0x01u8]); // RFC 6962 node prefix
        h.update(left);
        h.update(right);
        h.finalize().into()
    }

    /// Append one leaf (a signature), merging equal-size peaks.
    fn append(&mut self, leaf: &[u8]) {
        self.peaks.push((1, Self::leaf_hash(leaf)));
        while self.peaks.len() >= 2 {
            let n = self.peaks.len();
            if self.peaks[n - 1].0 != self.peaks[n - 2].0 {
                break;
            }
            let (_, right) = self.peaks.pop().unwrap();
            let (size, left) = self.peaks.pop().unwrap();
            self.peaks.push((size * 2, Self::node_hash(&left, &right)));
        }
    }

    /// Current tree head, or `[]` when empty (matches `merkle_tree_hash` -> None).
    fn root(&self) -> Vec<u8> {
        let Some((_, last)) = self.peaks.last() else {
            return Vec::new();
        };
        // root = node_hash(peak0, node_hash(peak1, … peak_last)) - fold right→left.
        let mut acc = *last;
        for (_, h) in self.peaks[..self.peaks.len() - 1].iter().rev() {
            acc = Self::node_hash(h, &acc);
        }
        acc.to_vec()
    }

    /// Serialize the peaks (8-byte LE size + 32-byte hash each) for persistence.
    fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.peaks.len() * 40);
        for (size, hash) in &self.peaks {
            out.extend_from_slice(&(*size as u64).to_le_bytes());
            out.extend_from_slice(hash);
        }
        out
    }

    fn from_bytes(bytes: &[u8]) -> Self {
        let mut peaks = Vec::new();
        let mut i = 0;
        while i + 40 <= bytes.len() {
            let size = u64::from_le_bytes(bytes[i..i + 8].try_into().unwrap()) as usize;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&bytes[i + 8..i + 40]);
            peaks.push((size, hash));
            i += 40;
        }
        Self { peaks }
    }
}

/// Resumable per-system chain state (genesis flag + per-collection sequence,
/// last signature, Merkle head), so `build_bundles` appends onto an existing chain.
#[derive(Default)]
pub struct SystemChains {
    genesis_done: bool,
    chains: HashMap<i32, (u64, Vec<u8>, IncrementalMerkle)>,
}

impl SystemChains {
    /// Rebuild from persisted rows `(collection, last_sequence, last_signature,
    /// merkle_bytes)`. A system with any row has already authored its genesis.
    pub fn resume(rows: Vec<(i32, u64, Vec<u8>, Vec<u8>)>) -> Self {
        let genesis_done = !rows.is_empty();
        let chains = rows
            .into_iter()
            .map(|(c, seq, sig, mb)| (c, (seq, sig, IncrementalMerkle::from_bytes(&mb))))
            .collect();
        Self {
            genesis_done,
            chains,
        }
    }

    /// Export for persistence: `(collection, last_sequence, last_signature, merkle_bytes)`.
    pub fn export(&self) -> Vec<(i32, u64, Vec<u8>, Vec<u8>)> {
        self.chains
            .iter()
            .map(|(c, (seq, sig, m))| (*c, *seq, sig.clone(), m.to_bytes()))
            .collect()
    }

    /// Last sequence authored in `collection` (0 if none) - for reply resolution.
    pub fn last_sequence(&self, collection: i32) -> u64 {
        self.chains.get(&collection).map(|(s, ..)| *s).unwrap_or(0)
    }
}

/// Wrap a signed event and its serialized content into an `EventBundle` ready to
/// push (no proofs/meta - the server derives what it needs).
fn event_bundle(signed: SignedEvent, content_bytes: Vec<u8>) -> EventBundle {
    EventBundle {
        signed_event: Some(signed),
        serialized_content: Some(SerializedContent { content_bytes }),
        event_proofs: Vec::new(),
        meta: None,
    }
}

/// One v2 content event to author under a migrated identity, in creation order.
pub struct MigratedContent {
    pub collection: i32,
    /// Serialized v2 `Content` bytes.
    pub content_bytes: Vec<u8>,
    /// Original creation time (unix millis), preserved from the legacy event.
    pub created_at: u64,
    /// Legacy event pointer this content came from (`hex(process):clock`), or
    /// `None` for synthesized content (e.g. the aggregated profile). Persisted
    /// so re-runs can reference already-migrated events.
    pub source: Option<String>,
    /// Legacy v1 `ContentType` of the source event (0 if synthesized).
    pub content_type: i64,
}

/// A v2 event authored for a migrated identity, reported back so the caller can
/// persist the legacy -> v2 mapping.
pub struct AuthoredEvent {
    /// Legacy pointer this event came from (`None` for genesis/profile).
    pub source: Option<String>,
    /// Legacy v1 `ContentType` of the source event (0 if synthesized).
    pub content_type: i64,
    pub collection: i32,
    pub sequence: u64,
    /// v2 event signature (hex).
    pub signature_hex: String,
    /// v2 content digest (the key the moderation service dedupes on).
    pub digest_type: i32,
    pub digest_bytes: Vec<u8>,
}

/// Signs migrated identities and their events with the master key.
pub struct Authoring {
    signing_key: SigningKey,
    master_public: PublicKey,
    /// Server URLs advertised in each identity document (`Identity.servers`).
    identity_servers: Vec<String>,
}

impl Authoring {
    /// Build from the hex-encoded 32-byte master ed25519 seed and the server
    /// URLs to advertise in each migrated identity document.
    pub fn new(signing_key_hex: &str, identity_servers: Vec<String>) -> Result<Self, String> {
        let seed = decode_hex_32(signing_key_hex)?;
        let signing_key = SigningKey::from_bytes(&seed);
        let master_public = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: signing_key.verifying_key().to_bytes().to_vec(),
        };
        Ok(Self {
            signing_key,
            master_public,
            identity_servers,
        })
    }

    /// The genesis identity document for a legacy system.
    pub fn identity_document(&self, legacy_public: &PublicKey) -> Identity {
        Identity {
            rotation_keys: vec![self.master_public.clone(), legacy_public.clone()],
            signing_keys: vec![],
            revocation_bounds: vec![],
            // Advertise the configured servers so clients know where to pull the
            // migrated account's data. Unset when none are configured.
            servers: (!self.identity_servers.is_empty()).then(|| ServerList {
                urls: self.identity_servers.clone(),
            }),
            recovery_key: None,
            recovery_signature: None,
        }
    }

    /// The v2 identity string a legacy system maps to.
    pub fn identity_string(&self, legacy_public: &PublicKey) -> String {
        self.identity_document(legacy_public).derive_hex_key()
    }

    /// The v2 identity string for a raw ed25519 system key (e.g. a followed system).
    pub fn identity_string_for_key(&self, ed25519_key: &[u8]) -> String {
        self.identity_string(&PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: ed25519_key.to_vec(),
        })
    }

    /// The master public key that signs every migrated event.
    pub fn master_public(&self) -> PublicKey {
        self.master_public.clone()
    }

    /// Author `contents` onto the identity's chain (resuming `chains`, adding
    /// genesis only when fresh), returning the identity string and push-ready
    /// bundles. `on_authored` fires once per authored event, for progress.
    pub fn build_bundles(
        &self,
        legacy_public: &PublicKey,
        contents: &[MigratedContent],
        genesis_created_at: u64,
        chains: &mut SystemChains,
        on_authored: impl Fn(),
    ) -> Result<(String, Vec<EventBundle>, Vec<AuthoredEvent>), String> {
        let doc = self.identity_document(legacy_public);
        let identity = doc.derive_hex_key();
        let mut authored: Vec<AuthoredEvent> = Vec::with_capacity(contents.len());
        let mut bundles: Vec<EventBundle> = Vec::with_capacity(contents.len() + 1);

        // Single signer with increasing sequences; `chains` carries the state
        // across runs so new events append instead of re-hashing the whole chain.
        let dedup = doc.deduplicated_keys();
        let self_pos = dedup
            .iter()
            .position(|pk| {
                pk.key_type == self.master_public.key_type && pk.key == self.master_public.key
            })
            .ok_or("master key missing from identity document")?;
        let dedup_len = dedup.len();
        // For our single-signer events the vector clock is `[0…]` with the
        // master's slot set to the event's own sequence.
        let vector_clock = |sequence: u64| {
            let mut vc = vec![0u64; dedup_len];
            vc[self_pos] = sequence;
            vc
        };

        // Genesis identity event (IDENTITY, sequence 1) - only for a new system.
        if !chains.genesis_done {
            let (identity_bytes, identity_digest) =
                content_and_digest(ContentBody::Identity(doc.clone()));
            let genesis = self.sign_event(
                &identity,
                collections::IDENTITY,
                1,
                1,
                vector_clock(1),
                identity_digest,
                &[],
                &[],
                genesis_created_at,
            )?;
            // Record IDENTITY chain state so resume detects genesis is done.
            let mut identity_merkle = IncrementalMerkle::default();
            identity_merkle.append(&genesis.signature);
            chains.chains.insert(
                collections::IDENTITY,
                (1, genesis.signature.clone(), identity_merkle),
            );
            bundles.push(event_bundle(genesis, identity_bytes));
            on_authored();
            chains.genesis_done = true;
        }

        // Per-collection state; authoring order is the canonical order, so append.
        let chains = &mut chains.chains;
        for item in contents {
            let digest = sha256_digest(&item.content_bytes);
            let entry = chains
                .entry(item.collection)
                .or_insert_with(|| (0, Vec::new(), IncrementalMerkle::default()));
            entry.0 += 1;
            let sequence = entry.0;
            let previous_signature = entry.1.clone();
            let previous_root = entry.2.root();

            let signed = self.sign_event(
                &identity,
                item.collection,
                sequence,
                1,
                vector_clock(sequence),
                digest.clone(),
                &previous_signature,
                &previous_root,
                item.created_at,
            )?;
            authored.push(AuthoredEvent {
                source: item.source.clone(),
                content_type: item.content_type,
                collection: item.collection,
                sequence,
                signature_hex: hex::encode(&signed.signature),
                digest_type: digest.r#type,
                digest_bytes: digest.value.clone(),
            });
            entry.1.clone_from(&signed.signature);
            entry.2.append(&signed.signature);
            bundles.push(event_bundle(signed, item.content_bytes.clone()));
            on_authored();
        }

        Ok((identity, bundles, authored))
    }

    #[allow(clippy::too_many_arguments)]
    fn sign_event(
        &self,
        identity: &str,
        collection: i32,
        sequence: u64,
        identity_sequence: u64,
        vector_clock: Vec<u64>,
        content_digest: ContentDigest,
        previous_signature: &[u8],
        previous_root: &[u8],
        created_at: u64,
    ) -> Result<SignedEvent, String> {
        let event = Event {
            key: Some(EventKey {
                collection,
                identity: identity.to_string(),
                signed_by: Some(self.master_public.clone()),
                sequence,
            }),
            identity_sequence,
            vector_clock: Some(VectorClock {
                sequence: vector_clock,
            }),
            previous_signature: previous_signature.to_vec(),
            previous_root: previous_root.to_vec(),
            content_digest: Some(content_digest),
            created_at,
            application: Some(grayjay_application()),
        };
        // The same checks the server runs in put_events.
        Validate::validate(&event).map_err(|errors| {
            format!("event {collection}/{sequence} invalid: {}", join(&errors))
        })?;
        let event_bytes = event.encode_to_vec();
        let signature = self.signing_key.sign(&event_bytes).to_bytes().to_vec();
        Ok(SignedEvent {
            signature,
            event_bytes,
        })
    }
}

/// Push bundles to a single server. Returns the per-event errors the server
/// reported (empty on full success).
pub async fn push(server: &str, bundles: Vec<EventBundle>) -> Result<Vec<String>, String> {
    if bundles.is_empty() {
        return Ok(vec![]);
    }
    let response = tokio::time::timeout(PUSH_TIMEOUT, core_sync::push_bundles(server, bundles))
        .await
        .map_err(|_| format!("push to {server} timed out"))?
        .map_err(|e| e.to_string())?;
    Ok(response.errors.into_iter().map(|e| e.message).collect())
}

/// Validation errors as one comma separated string.
pub fn join<E: std::fmt::Display>(errors: &[E]) -> String {
    errors
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Wrap a `ContentBody` into a serialized `Content` and its digest.
pub fn content_and_digest(body: ContentBody) -> (Vec<u8>, ContentDigest) {
    let content = Content {
        content_body: Some(body),
    };
    let bytes = content.encode_to_vec();
    let digest = sha256_digest(&bytes);
    (bytes, digest)
}

fn sha256_digest(bytes: &[u8]) -> ContentDigest {
    ContentDigest {
        r#type: ContentDigestType::Sha256 as i32,
        value: Sha256::digest(bytes).to_vec(),
    }
}

fn decode_hex_32(s: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(s.trim()).map_err(|e| format!("invalid hex: {e}"))?;
    bytes
        .try_into()
        .map_err(|_| "expected 32 bytes".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::merkle::merkle_tree_hash;

    #[test]
    fn identity_document_carries_configured_servers() {
        let legacy = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: vec![9u8; 32],
        };
        // Unset when none configured.
        let none = Authoring::new(&"22".repeat(32), vec![]).unwrap();
        assert!(none.identity_document(&legacy).servers.is_none());

        // Present with the configured URLs, and it changes the identity string.
        let urls = vec![
            "https://srv.harbor.social".to_string(),
            "https://srv.polycentric.io".to_string(),
        ];
        let with = Authoring::new(&"22".repeat(32), urls.clone()).unwrap();
        let doc = with.identity_document(&legacy);
        assert_eq!(doc.servers.as_ref().unwrap().urls, urls);
        assert_ne!(
            none.identity_string(&legacy),
            with.identity_string(&legacy),
            "servers are part of the hashed identity document"
        );
    }

    #[test]
    fn incremental_merkle_matches_reference() {
        let mut inc = IncrementalMerkle::default();
        assert_eq!(inc.root(), Vec::<u8>::new(), "empty tree");
        let mut leaves: Vec<Vec<u8>> = Vec::new();
        // Cover every size across several power-of-2 boundaries.
        for i in 0u32..40 {
            let leaf = format!("signature-{i}").into_bytes();
            inc.append(&leaf);
            leaves.push(leaf);
            assert_eq!(
                inc.root(),
                merkle_tree_hash(&leaves).unwrap().to_vec(),
                "incremental root mismatch at size {}",
                leaves.len()
            );
        }
    }

    fn content(collection: i32, bytes: &[u8], created_at: u64) -> MigratedContent {
        MigratedContent {
            collection,
            content_bytes: bytes.to_vec(),
            created_at,
            source: None,
            content_type: 0,
        }
    }

    /// The incrementally-built chain must satisfy the protocol invariants the
    /// server checks: per-collection sequences, `previous_signature` linking to
    /// the prior event, `previous_root` = Merkle over prior signatures, and
    /// content digests matching. Critically, it verifies our key assumption that
    /// authoring order equals rs-common's *canonical* order.
    #[test]
    #[allow(clippy::type_complexity)]
    fn incremental_chain_matches_protocol() {
        let authoring = Authoring::new(&"11".repeat(32), vec![]).unwrap();
        let legacy = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: vec![7u8; 32],
        };
        let contents = vec![
            content(collections::FEED, b"post one", 1000),
            content(collections::INTERACTIONS, b"reaction a", 1001),
            content(collections::FEED, b"post two", 1002),
            content(collections::FEED, b"post three", 1003),
            content(collections::INTERACTIONS, b"reaction b", 1004),
        ];
        let mut chains = SystemChains::default();
        let (identity, bundles, authored) = authoring
            .build_bundles(&legacy, &contents, 999, &mut chains, || {})
            .unwrap();
        assert_eq!(identity, authoring.identity_string(&legacy));
        assert_eq!(bundles.len(), contents.len() + 1); // + genesis
        assert_eq!(authored.len(), contents.len());

        // Decode every event; check content digests; collect per collection in
        // bundle (authoring) order as (event_bytes, signature, Event).
        let mut per_collection: HashMap<i32, Vec<(Vec<u8>, Vec<u8>, Event)>> = HashMap::new();
        for b in &bundles {
            let se = b.signed_event.as_ref().unwrap();
            let ev = Event::decode(se.event_bytes.as_slice()).unwrap();
            let digest = ev.content_digest.clone().unwrap();
            let content = b.serialized_content.as_ref().unwrap();
            assert_eq!(
                digest.value,
                Sha256::digest(&content.content_bytes).to_vec()
            );
            per_collection
                .entry(ev.key.as_ref().unwrap().collection)
                .or_default()
                .push((se.event_bytes.clone(), se.signature.clone(), ev));
        }
        assert_eq!(per_collection[&collections::FEED].len(), 3);
        assert_eq!(per_collection[&collections::INTERACTIONS].len(), 2);

        for events in per_collection.values() {
            let mut sigs: Vec<Vec<u8>> = Vec::new();
            for (i, (_, sig, ev)) in events.iter().enumerate() {
                assert_eq!(ev.key.as_ref().unwrap().sequence, (i + 1) as u64);
                assert_eq!(
                    ev.previous_signature,
                    sigs.last().cloned().unwrap_or_default()
                );
                assert_eq!(
                    ev.previous_root,
                    merkle_tree_hash(&sigs)
                        .map(|h| h.to_vec())
                        .unwrap_or_default()
                );
                sigs.push(sig.clone());
            }
            // Authoring order must equal rs-common's canonical order.
            let items = events
                .iter()
                .map(|(bytes, sig, _)| (bytes.as_slice(), sig.as_slice()));
            let canonical = polycentric_common::merkle::canonical_signatures(items);
            assert_eq!(canonical, sigs, "authoring order must be canonical order");
        }
    }

    /// Authoring in two resumed passes must produce byte-identical events to a
    /// single pass - the property continuous append relies on.
    #[test]
    fn resume_appends_identical_chain() {
        let authoring = Authoring::new(&"33".repeat(32), vec![]).unwrap();
        let legacy = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: vec![5u8; 32],
        };
        let all = vec![
            content(collections::FEED, b"p1", 10),
            content(collections::INTERACTIONS, b"r1", 11),
            content(collections::FEED, b"p2", 12),
        ];

        let mut single_chains = SystemChains::default();
        let (_, full, _) = authoring
            .build_bundles(&legacy, &all, 1, &mut single_chains, || {})
            .unwrap();

        // First pass authors genesis + p1, then persist/resume and append r1 + p2.
        let mut chains = SystemChains::default();
        let (_, first, _) = authoring
            .build_bundles(&legacy, &all[..1], 1, &mut chains, || {})
            .unwrap();
        let mut chains = SystemChains::resume(chains.export());
        let (_, rest, _) = authoring
            .build_bundles(&legacy, &all[1..], 1, &mut chains, || {})
            .unwrap();

        let sig = |b: &EventBundle| b.signed_event.as_ref().unwrap().signature.clone();
        let single: Vec<_> = full.iter().map(sig).collect();
        let resumed: Vec<_> = first.iter().chain(rest.iter()).map(sig).collect();
        assert_eq!(single, resumed, "resumed chain must match a single pass");
        assert_eq!(first.len(), 2, "first pass = genesis + p1");
        assert_eq!(rest.len(), 2, "resumed pass = r1 + p2, no new genesis");
    }
}
