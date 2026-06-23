use polycentric_common::{
    error::CoreError,
    models::{
        collections,
        protos_v2::{ContentDigest, EventProofTarget, Identity, PublicKey, VectorClock},
    },
};
use prost::Message;
use sha2::{Digest, Sha256};

use crate::store::event_store::EventStore;
use crate::vector_clock;

pub struct DecodedIdentityEvent {
    pub sequence: u64,
    pub signer: PublicKey,
    pub digest: ContentDigest,
    pub content: Identity,
    /// `None` for genesis (no prior doc) and legacy events; required otherwise.
    pub vc: Option<VectorClock>,
}

/// Decoded identity events for one identity, sorted by sequence. May
/// contain forgeries or conflicts — call [`Self::validate`] for a clean chain.
pub struct IdentityDirectory {
    identity: String,
    events: Vec<DecodedIdentityEvent>,
}

impl IdentityDirectory {
    pub fn new(identity: String, mut events: Vec<DecodedIdentityEvent>) -> Self {
        events.sort_by_key(|e| e.sequence);
        Self { identity, events }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    /// Earliest event whose `Identity` content hashes to the identity string.
    pub fn genesis(&self) -> Result<&DecodedIdentityEvent, CoreError> {
        self.events
            .iter()
            .find(|e| identity_matches_content(&self.identity, &e.content))
            .ok_or_else(|| {
                CoreError::InvalidEvent(format!(
                    "No genesis identity event found for identity {}",
                    self.identity
                ))
            })
    }

    /// Raw entries at `sequence`. May contain forgeries — prefer
    /// [`ValidatedChain::at_sequence`].
    pub fn raw_at_sequence(&self, sequence: u64) -> impl Iterator<Item = &DecodedIdentityEvent> {
        self.events.iter().filter(move |e| e.sequence == sequence)
    }

    pub fn iter(&self) -> impl Iterator<Item = &DecodedIdentityEvent> {
        self.events.iter()
    }

    /// Walk from genesis forward. At each step take the rotation-authorized
    /// candidate whose VC verifies; ties broken by smallest signer key. Stops
    /// where no candidate passes. Errors only if genesis itself fails.
    pub fn validate<'a>(&'a self, store: &EventStore) -> Result<ValidatedChain<'a>, CoreError> {
        let genesis = self.genesis()?;
        let mut chain: Vec<&DecodedIdentityEvent> = vec![genesis];
        let mut current = genesis;
        loop {
            let next_seq = current.sequence + 1;
            let mut candidates: Vec<&DecodedIdentityEvent> = self
                .raw_at_sequence(next_seq)
                .filter(|e| {
                    current.content.authorizes_rotation(&e.signer)
                        || (current.content.authorizes_signer(&e.signer)
                            // Signing keys are allowed to sign the same content
                            // to acknowledge their membership in the identity
                            && e.content == current.content)
                })
                .filter(|e| match &e.vc {
                    // Chain building needs the full causal history: only accept
                    // a candidate whose vector clock verifies and references no
                    // unsynced events.
                    Some(vc) => vector_clock::verify_vector_clock(
                        store,
                        vc,
                        &e.content,
                        &self.identity,
                        collections::IDENTITY,
                        &e.signer,
                        e.sequence,
                    )
                    .map(|missing| missing.is_empty())
                    .unwrap_or(false),
                    None => true,
                })
                .collect();
            if candidates.is_empty() {
                return Ok(ValidatedChain {
                    identity: &self.identity,
                    events: chain,
                });
            }
            candidates.sort_by(|a, b| a.signer.key.cmp(&b.signer.key));
            let next = candidates[0];
            chain.push(next);
            current = next;
        }
    }
}

/// A validated identity chain from genesis to head. Use this for content
/// and revocation lookups — not [`IdentityDirectory::raw_at_sequence`].
pub struct ValidatedChain<'a> {
    identity: &'a str,
    events: Vec<&'a DecodedIdentityEvent>,
}

impl<'a> ValidatedChain<'a> {
    pub fn identity(&self) -> &'a str {
        self.identity
    }

    /// The deepest validated identity event (the CRDT head).
    pub fn head(&self) -> &'a DecodedIdentityEvent {
        self.events
            .last()
            .copied()
            .expect("chain always contains at least the genesis event")
    }

    /// The chain entry at `sequence`.
    pub fn at_sequence(&self, sequence: u64) -> Option<&'a DecodedIdentityEvent> {
        self.events.iter().copied().find(|e| e.sequence == sequence)
    }

    /// Identity content at `sequence`.
    pub fn content_at_sequence(&self, sequence: u64) -> Option<&'a Identity> {
        self.at_sequence(sequence).map(|e| &e.content)
    }

    /// Genesis first.
    pub fn iter(&self) -> impl Iterator<Item = &'a DecodedIdentityEvent> + '_ {
        self.events.iter().copied()
    }

    /// Target recorded for `(signer, collection)` at signer's latest
    /// revocation. `None` if never revoked or no target for this collection.
    pub fn revocation_target(
        &self,
        signer: &PublicKey,
        collection: i32,
    ) -> Option<&EventProofTarget> {
        let mut latest_revocation: Option<&DecodedIdentityEvent> = None;
        for window in self.events.windows(2) {
            let prev = window[0];
            let curr = window[1];
            if prev.content.authorizes_signer(signer) && !curr.content.authorizes_signer(signer) {
                latest_revocation = Some(curr);
            }
        }
        let rev = latest_revocation?;
        rev.content
            .revocation_bounds
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

/// True when `identity` is the hex sha256 of the encoded `Identity`
/// message bytes (not the outer `Content` wrapper).
fn identity_matches_content(identity: &str, content: &Identity) -> bool {
    sha256_hex(&content.encode_to_vec()) == identity
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect()
}
