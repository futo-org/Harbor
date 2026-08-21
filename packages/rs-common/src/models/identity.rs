//! Canonical shared logic for processing identity documents.
//! All identity chain walking should go through here so that the logic does not
//! diverge.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use prost::Message;
use sha2::{Digest, Sha256};

use crate::models::protos_v2::{RevocationBound, ServerList};
use crate::{
    models::{
        collections,
        protos_v2::{
            Content, Event, EventProofTarget, Identity, KeyType, PublicKey, content::ContentBody,
        },
    },
    signing,
};

impl Identity {
    /// Derive an identity key hex string from this identity content.
    /// Keep in mind that identity documents in a chain all belong to the identity
    /// key from the genesis document.
    pub fn derive_hex_key(&self) -> String {
        let bytes = self.encode_to_vec();
        let digest = Sha256::digest(bytes);
        hex::encode(digest.as_slice())
    }

    /// Canonical deduplicated key ordering: rotation_keys and signing_keys,
    /// first occurrence wins. Vector clock positions in any event that
    /// references this identity doc align to this ordering.
    pub fn deduplicated_keys(&self) -> Vec<&PublicKey> {
        let mut seen = HashSet::new();
        self.rotation_keys
            .iter()
            .chain(self.signing_keys.iter())
            .filter(|pk| seen.insert((pk.key_type, pk.key.as_slice())))
            .collect()
    }

    /// True if `pk` is listed as either a rotation or signing key — i.e.
    /// permitted to sign any event for this identity.
    pub fn authorizes_signer(&self, pk: &PublicKey) -> bool {
        self.rotation_keys
            .iter()
            .chain(self.signing_keys.iter())
            .any(|k| k.key_type == pk.key_type && k.key == pk.key)
    }

    /// True if `pk` is listed as a rotation key — i.e. permitted to extend
    /// the identity chain by signing the next identity event.
    pub fn authorizes_rotation(&self, pk: &PublicKey) -> bool {
        self.rotation_keys
            .iter()
            .any(|k| k.key_type == pk.key_type && k.key == pk.key)
    }

    /// Find the revocation target for a given signer and collection, as recorded
    /// by this identity document, or return `None` if there is not one.
    pub fn revocation_target_for(
        &self,
        signer: &PublicKey,
        collection: i32,
    ) -> Option<&EventProofTarget> {
        self.revocation_bounds
            .iter()
            .find(|rb| {
                rb.revoked_key
                    .as_ref()
                    .map(|pk| pk.key_type == signer.key_type && pk.key == signer.key)
                    .unwrap_or(false)
            })?
            .targets
            .iter()
            .find(|t| t.collection == collection)
    }
}

/// Candidate identity event and content from any source.
/// Identity processing code will treat these as untrusted and filter out
/// identity candidates that don't pass validation checks.
pub struct IdentityCandidate<'a> {
    /// Canonical serialized event bytes for the event.
    /// This should match the provided signature.
    pub event_bytes: &'a [u8],

    /// Canonical serialized content bytes for the event's content.
    /// This should match the content digest in the event.
    pub content_bytes: &'a [u8],

    /// Signature of the event bytes using the signer in the event's event key.
    pub signature: &'a [u8],
}

/// Information extracted from an identity candidate.
pub struct IdentityEvent {
    // Extracted event key fields:
    pub sequence: u64,
    pub signer: PublicKey,
    // Identity content:
    pub document: Identity,
}

pub struct IdentityChain {
    /// The full identity chain with the genesis element at index 0 with sequence = 1,
    /// and each successor identity event following.
    identity_events: Vec<IdentityEvent>,
}

/// Find the latest valid identity document for the identity using the candidates
/// provided.
/// The candidates should contain all known identity events for `identity` so that
/// the whole chain can be verified.
pub fn resolve_chain<'a>(
    identity: &str,
    candidates: impl IntoIterator<Item = IdentityCandidate<'a>>,
) -> Option<IdentityChain> {
    // Filter out bad candidates and collect into a map
    let mut by_seq = {
        let mut map: HashMap<u64, Vec<IdentityEvent>> = HashMap::new();

        for candidate in candidates {
            let Some(decoded) = preprocess_candidate(identity, &candidate) else {
                continue;
            };

            map.entry(decoded.sequence).or_default().push(decoded);
        }

        map
    };

    // Genesis must have a sequence of 1 and hash to the identity string.
    let genesis = by_seq
        .remove(&1)?
        .into_iter()
        .filter(|c| c.document.derive_hex_key() == identity)
        .filter(|c| c.document.authorizes_rotation(&c.signer))
        // Pick among the valid candidates deterministically:
        .max_by(|a, b| compare_signers(&a.signer, &b.signer))?;

    // Walk the map and record the chain
    let mut chain = Vec::<IdentityEvent>::new();
    chain.push(genesis);

    loop {
        let head = chain.last()?;
        let next_seq = head.sequence + 1;
        let Some(candidates) = by_seq.remove(&next_seq) else {
            break;
        };

        let next = candidates
            .into_iter()
            // Keep only candidates that can succeed the head and record why
            .filter_map(|c| {
                let reason = justify_succession(identity, head, &c)?;
                Some((c, reason))
            })
            // Pick among the valid candidates deterministically:
            // We need both the identity event and the succession reason
            .max_by(|(e1, r1), (e2, r2)| compare_successors((e1, *r1), (e2, *r2)));

        if let Some((next, _)) = next {
            chain.push(next);
        } else {
            break;
        }
    }

    Some(IdentityChain {
        identity_events: chain,
    })
}

/// Resolve the latest valid identity document for a given identity.
pub fn resolve_latest<'a>(
    identity: &str,
    candidates: impl IntoIterator<Item = IdentityCandidate<'a>>,
) -> Option<Identity> {
    resolve_chain(identity, candidates)?
        .identity_events
        .pop()
        .map(|event| event.document)
}

/// Extract the information we need from the candidate and ensure it is
/// internally consistent (valid signature and digest).
fn preprocess_candidate(identity: &str, candidate: &IdentityCandidate) -> Option<IdentityEvent> {
    // Extract event data
    let event = Event::decode(candidate.event_bytes).ok()?;
    let event_key = event.key?;
    let sequence = event_key.sequence;
    let signer = event_key.signed_by?;
    let content_digest = event.content_digest?;

    // Validate event key
    if event_key.identity != identity || event_key.collection != collections::IDENTITY {
        return None;
    }

    // TODO: validate or sanity-check vector clock?
    // rs-core had some validation for the vector clock in the identity-chain validation,
    // but it didn't seem to check anything meaningful for chain validity.
    // Instead, it allowed valid identity events to be rejected if the server withheld
    // other events.
    // That said, we may still find it useful to enforce some vector clock properties.

    // Extract content data
    let content = Content::decode(candidate.content_bytes).ok()?;
    let document = match content.content_body? {
        ContentBody::Identity(d) => Some(d),
        _ => None,
    }?;

    // Validate event signature
    if !signature_matches(&signer, candidate.signature, candidate.event_bytes) {
        return None;
    }

    // Validate content digest
    content_digest
        .verify_against(candidate.content_bytes)
        .ok()?;

    // Construct output
    let out = IdentityEvent {
        sequence,
        signer,
        document,
    };

    Some(out)
}

/// Reasons for an identity event to succeed another one.
/// Ordered by lowest precedence to highest.
#[derive(PartialEq, Eq, PartialOrd, Ord, Copy, Clone)]
enum SuccessionReason {
    Republish,
    Recovery,
    Rotation,
}

/// A subset of the identity document that contains the actual identity content.
/// Non-rotation signing keys are not allowed to publish identity documents with
/// any of these fields modified.
#[derive(PartialEq)]
struct IdentityContent<'a> {
    rotation_keys: &'a [PublicKey],
    signing_keys: &'a [PublicKey],
    revocation_bounds: &'a [RevocationBound],
    servers: &'a Option<ServerList>,
    recovery_key: &'a Option<PublicKey>,
}

impl<'a> From<&'a Identity> for IdentityContent<'a> {
    fn from(val: &'a Identity) -> Self {
        // Explicitly include/exclude fields to prevent drift
        let Identity {
            rotation_keys,
            signing_keys,
            revocation_bounds,
            servers,
            recovery_key,
            recovery_signature: _,
        } = val;

        IdentityContent {
            rotation_keys,
            signing_keys,
            revocation_bounds,
            servers,
            recovery_key,
        }
    }
}

/// Returns whether `to` is a valid republish of `from`.
/// This is based on the identity documents and ignores the sequencing.
fn is_republish(from: &IdentityEvent, to: &IdentityEvent) -> bool {
    if !from.document.authorizes_signer(&to.signer) {
        return false;
    }

    let from = IdentityContent::from(&from.document);
    let to = IdentityContent::from(&to.document);
    from == to
}

/// Return a reason to allow `candidate` to succeed `head` or `None` if it
/// should not be permitted to do so.
fn justify_succession(
    identity: &str,
    head: &IdentityEvent,
    candidate: &IdentityEvent,
) -> Option<SuccessionReason> {
    // A rotation key can always create a new identity document
    if head.document.authorizes_rotation(&candidate.signer) {
        return Some(SuccessionReason::Rotation);
    }

    // Permit even a non-rotation key to add to the chain if it doesn't change anything
    if is_republish(head, candidate) {
        return Some(SuccessionReason::Republish);
    }

    // Allow a brand new document to continue the chain if the recovery key vouches
    // for the signing rotation key of the event:

    // Require the signer to be in the document as a rotation key.
    if !candidate.document.authorizes_rotation(&candidate.signer) {
        return None;
    }

    // Check if we have a valid recovery signature.
    let key = head.document.recovery_key.as_ref()?;
    let signature = candidate.document.recovery_signature.as_deref()?;
    let payload = assemble_recovery_payload(identity, &candidate.signer);

    if signature_matches(key, signature, &payload) {
        Some(SuccessionReason::Recovery)
    } else {
        None
    }
}

/// The bytes a recovery signature covers:
/// (identity_string, rotation_key_type, rotation_key_bytes)
/// These should be appended back-to-back and the key type should be in network byte order.
pub fn assemble_recovery_payload(identity: &str, rotation_key: &PublicKey) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(identity.as_bytes());
    payload.extend_from_slice(&rotation_key.key_type.to_be_bytes());
    payload.extend_from_slice(&rotation_key.key);
    payload
}

impl IdentityChain {
    /// Get the identity event in the chain for a given sequence number.
    pub fn event_at_sequence(&self, seq: u64) -> Option<&IdentityEvent> {
        let idx = usize::try_from(seq.checked_sub(1)?).ok()?;
        self.identity_events.get(idx)
    }

    /// Get the identity document in the chain for a given sequence number.
    pub fn state_at_sequence(&self, seq: u64) -> Option<&Identity> {
        self.event_at_sequence(seq).map(|event| &event.document)
    }

    /// Get the latest identity event in the chain.
    pub fn latest_event(&self) -> Option<&IdentityEvent> {
        self.identity_events.last()
    }

    /// Get the latest valid identity document in the chain.
    pub fn latest_state(&self) -> Option<&Identity> {
        self.latest_event().map(|event| &event.document)
    }

    /// Iterate over the chain's identity events.
    pub fn iter(&self) -> impl Iterator<Item = &IdentityEvent> {
        self.identity_events.iter()
    }

    /// Find the revocation target for a given signer and collection or return
    /// `None` if there is not one.
    pub fn revocation_target_for(
        &self,
        signer: &PublicKey,
        collection: i32,
    ) -> Option<&EventProofTarget> {
        // TODO: should we walk the chain instead of just checking the head?
        // The old rs-core code did but the server code did not.
        // We may want to just have identity documents carry all known valid bounds
        // so that the head is always the latest identity information for an identity.
        self.latest_state()?
            .revocation_target_for(signer, collection)
    }
}

/// Canonical total order over signers.
/// Used for selecting a canonical identity event among multiple valid candidates.
/// Take the max to select the preferred one.
fn compare_signers(a: &PublicKey, b: &PublicKey) -> Ordering {
    a.key_type.cmp(&b.key_type).then_with(|| a.key.cmp(&b.key))
}

/// Canonical total order over identity events.
/// Used for selecting a canonical identity event among multiple valid candidates.
/// Take the max to select the preferred one.
fn compare_successors(
    a: (&IdentityEvent, SuccessionReason),
    b: (&IdentityEvent, SuccessionReason),
) -> Ordering {
    let (e1, r1) = a;
    let (e2, r2) = b;

    // We really should only be comparing identity events with the same sequence number,
    // but we will include sequence in the comparison just in case.
    e1.sequence
        .cmp(&e2.sequence)
        // We will prefer rotation > recovery > republish.
        // This prevents a malicious signing key with a high priority as
        // determined by `compare_signers()` from stalling its own revocation by
        // repeatedly republishing the latest valid identity document that
        // still includes it.
        // More generally, this prevents a legitimate rotation or recovery from
        // being swallowed by a signing key republishing.
        .then_with(|| r1.cmp(&r2))
        .then_with(|| compare_signers(&e1.signer, &e2.signer))
        // This also shouldn't happen since both events would have the same event key.
        // We will order them by the identity document, and if those are the same,
        // then we conclude that the events are the same.
        .then_with(|| {
            e1.document
                .derive_hex_key()
                .cmp(&e2.document.derive_hex_key())
        })
}

fn signature_matches(key: &PublicKey, sig: &[u8], data: &[u8]) -> bool {
    match key.key_type {
        t if t == KeyType::Ed25519 as i32 => {
            let key = &key.key;
            signing::verify_signature(key, sig, data).is_ok()
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ED25519: i32 = 1;
    const UNSPECIFIED: i32 = 0;

    fn pk(key_type: i32, key: &[u8]) -> PublicKey {
        PublicKey {
            key_type,
            key: key.to_vec(),
        }
    }

    fn identity(rotation: Vec<PublicKey>, signing: Vec<PublicKey>) -> Identity {
        Identity {
            rotation_keys: rotation,
            signing_keys: signing,
            revocation_bounds: Vec::new(),
            servers: None,
            recovery_key: None,
            recovery_signature: None,
        }
    }

    #[test]
    fn deduplicated_keys_empty_identity() {
        let id = identity(vec![], vec![]);
        assert!(id.deduplicated_keys().is_empty());
    }

    #[test]
    fn deduplicated_keys_preserves_rotation_then_signing_order() {
        let r0 = pk(ED25519, b"r0");
        let r1 = pk(ED25519, b"r1");
        let s0 = pk(ED25519, b"s0");
        let s1 = pk(ED25519, b"s1");
        let id = identity(vec![r0.clone(), r1.clone()], vec![s0.clone(), s1.clone()]);
        let got: Vec<&PublicKey> = id.deduplicated_keys();
        assert_eq!(got, vec![&r0, &r1, &s0, &s1]);
    }

    #[test]
    fn deduplicated_keys_drops_duplicate_within_rotation() {
        let a = pk(ED25519, b"a");
        let b = pk(ED25519, b"b");
        let id = identity(vec![a.clone(), b.clone(), a.clone()], vec![]);
        let got = id.deduplicated_keys();
        assert_eq!(got, vec![&a, &b]);
    }

    #[test]
    fn deduplicated_keys_drops_duplicate_across_rotation_and_signing() {
        let shared = pk(ED25519, b"shared");
        let only_signing = pk(ED25519, b"signing-only");
        let id = identity(
            vec![shared.clone()],
            vec![shared.clone(), only_signing.clone()],
        );
        let got = id.deduplicated_keys();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].key, shared.key);
        assert_eq!(got[1].key, only_signing.key);
    }

    #[test]
    fn deduplicated_keys_drops_duplicate_within_signing() {
        let s = pk(ED25519, b"s");
        let id = identity(vec![], vec![s.clone(), s.clone()]);
        let got = id.deduplicated_keys();
        assert_eq!(got, vec![&s]);
    }

    #[test]
    fn deduplicated_keys_treats_different_key_types_as_distinct() {
        let a_ed = pk(ED25519, b"same-bytes");
        let a_unspec = pk(UNSPECIFIED, b"same-bytes");
        let id = identity(vec![a_ed.clone(), a_unspec.clone()], vec![]);
        let got = id.deduplicated_keys();
        assert_eq!(got, vec![&a_ed, &a_unspec]);
    }

    #[test]
    fn authorizes_signer_accepts_rotation_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r.clone()], vec![]);
        assert!(id.authorizes_signer(&r));
    }

    #[test]
    fn authorizes_signer_accepts_signing_key() {
        let s = pk(ED25519, b"s");
        let id = identity(vec![], vec![s.clone()]);
        assert!(id.authorizes_signer(&s));
    }

    #[test]
    fn authorizes_signer_rejects_unknown_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r], vec![]);
        assert!(!id.authorizes_signer(&pk(ED25519, b"other")));
    }

    #[test]
    fn authorizes_signer_rejects_matching_bytes_with_different_type() {
        let id = identity(vec![pk(ED25519, b"k")], vec![]);
        assert!(!id.authorizes_signer(&pk(UNSPECIFIED, b"k")));
    }

    #[test]
    fn authorizes_signer_rejects_against_empty_identity() {
        let id = identity(vec![], vec![]);
        assert!(!id.authorizes_signer(&pk(ED25519, b"anything")));
    }

    #[test]
    fn authorizes_rotation_accepts_rotation_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r.clone()], vec![]);
        assert!(id.authorizes_rotation(&r));
    }

    #[test]
    fn authorizes_rotation_rejects_signing_only_key() {
        let s = pk(ED25519, b"s");
        let id = identity(vec![], vec![s.clone()]);
        assert!(!id.authorizes_rotation(&s));
    }

    #[test]
    fn authorizes_rotation_rejects_unknown_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r], vec![]);
        assert!(!id.authorizes_rotation(&pk(ED25519, b"other")));
    }

    #[test]
    fn authorizes_rotation_rejects_matching_bytes_with_different_type() {
        let id = identity(vec![pk(ED25519, b"k")], vec![]);
        assert!(!id.authorizes_rotation(&pk(UNSPECIFIED, b"k")));
    }

    #[test]
    fn key_listed_in_both_lists_authorizes_both_signer_and_rotation() {
        let k = pk(ED25519, b"k");
        let id = identity(vec![k.clone()], vec![k.clone()]);
        assert!(id.authorizes_signer(&k));
        assert!(id.authorizes_rotation(&k));
    }
}
