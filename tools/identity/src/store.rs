//! File-backed persistence of the identity event chain and its keys.
//!
//! An identity is a chain of signed events in the IDENTITY collection. Each
//! event references (but does not embed) its content; we store both. On-disk
//! layout under the storage directory:
//!
//! ```text
//! <dir>/identity                 # the identity string (genesis hash), text
//! <dir>/keys/<pubhex>.private     # raw 32-byte Ed25519 private key
//! <dir>/events/000001.event       # SignedEvent protobuf bytes
//! <dir>/events/000001.content     # Content protobuf bytes (the identity doc)
//! ```
//!
//! All events are signed by the genesis (primary) rotation key, so the chain
//! is a simple linear sequence 1, 2, 3, … Adding or revoking a key appends a
//! new event whose content is the updated identity document.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, bail, Context, Result};
use polycentric_common::models::collections::IDENTITY;
use polycentric_common::models::protos_v2::{
    content::ContentBody, Content, Event, Identity, PublicKey, RevocationBound, SignedEvent,
};
use prost::Message;

use crate::event::{self, EventParams};
use crate::identity;
use crate::key::{KeyKind, KeyPair, PRIVATE_KEY_LEN};

const IDENTITY_FILE: &str = "identity";
const KEYS_DIR: &str = "keys";
const EVENTS_DIR: &str = "events";

/// A summary of a key that was just added.
pub struct AddedKey {
    pub kind: KeyKind,
    pub public_key: Vec<u8>,
}

impl AddedKey {
    pub fn public_hex(&self) -> String {
        hex::encode(&self.public_key)
    }
}

/// One identity event in the chain, decoded for display.
pub struct ChainEntry {
    pub sequence: u64,
    pub signer: Vec<u8>,
    pub doc: Identity,
}

/// A signed event paired with its serialized content, ready to publish to a
/// server (or feed to a validator).
pub struct ExportedEvent {
    pub signed_event: SignedEvent,
    pub content: Vec<u8>,
}

/// File-backed identity keystore + event chain, rooted at a directory.
pub struct IdentityStore {
    dir: PathBuf,
}

impl IdentityStore {
    /// Open the keystore in `dir`, creating it if needed. On Unix the
    /// directory is restricted to the owner.
    pub fn open(dir: &Path) -> Result<Self> {
        fs::create_dir_all(dir)
            .with_context(|| format!("creating storage directory {}", dir.display()))?;
        restrict_permissions(dir, 0o700);
        Ok(Self {
            dir: dir.to_path_buf(),
        })
    }

    /// Whether an identity has already been created in this store.
    pub fn is_initialized(&self) -> bool {
        self.identity_path().exists()
    }

    /// The identity string (hex SHA256 of the genesis `Identity` bytes).
    pub fn identity(&self) -> Result<String> {
        let raw = fs::read_to_string(self.identity_path())
            .context("no identity yet; run `create` first")?;
        Ok(raw.trim().to_string())
    }

    /// Create the identity: generate the primary rotation key, then sign and
    /// store the genesis identity event. Returns the identity string.
    pub fn create_identity(&mut self) -> Result<String> {
        if self.is_initialized() {
            bail!("an identity already exists in {}", self.dir.display());
        }
        let primary = KeyPair::generate();
        self.store_private_key(&primary)?;

        let doc = identity::genesis(primary.to_public_key());
        let identity_string = doc.derive_hex_key();

        // Genesis: sequence 1, identity_sequence 1 (self-reference).
        self.append_event(&identity_string, &primary, 1, 1, &doc)?;
        write_private(
            &self.identity_path(),
            format!("{identity_string}\n").as_bytes(),
        )?;
        Ok(identity_string)
    }

    /// Generate a new key of `kind`, append an identity event adding it to the
    /// document, and return the new key.
    pub fn add_key(&mut self, kind: KeyKind) -> Result<AddedKey> {
        let chain = self.require_chain()?;
        let mut doc = head(&chain).doc.clone();

        let new_key = KeyPair::generate();
        self.store_private_key(&new_key)?;
        match kind {
            KeyKind::Rotation => doc.rotation_keys.push(new_key.to_public_key()),
            KeyKind::Signing => doc.signing_keys.push(new_key.to_public_key()),
        }

        self.append_next(&chain, &doc)?;
        Ok(AddedKey {
            kind,
            public_key: new_key.public_key,
        })
    }

    /// Revoke the key with the given public-key hex: append an identity event
    /// whose document omits the key and records a [`RevocationBound`].
    pub fn revoke_key(&mut self, public_hex: &str) -> Result<KeyKind> {
        let target = hex::decode(public_hex.trim())
            .ok()
            .filter(|b| !b.is_empty())
            .ok_or_else(|| anyhow!("invalid public key hex: {public_hex}"))?;

        let chain = self.require_chain()?;
        if genesis_key(&chain).key == target {
            bail!("refusing to revoke the genesis key — it roots the identity");
        }
        let mut doc = head(&chain).doc.clone();

        let kind = if remove_key(&mut doc.rotation_keys, &target) {
            KeyKind::Rotation
        } else if remove_key(&mut doc.signing_keys, &target) {
            KeyKind::Signing
        } else {
            bail!("no active key {public_hex} in the current identity");
        };

        // The revoked key never signed events in this tool (only the genesis
        // key signs identity events), so it anchors no per-collection targets.
        debug_assert!(self.events_signed_by(&chain, &target).is_empty());
        doc.revocation_bounds.push(RevocationBound {
            revoked_key: Some(PublicKey {
                key_type: 1, // KEY_TYPE_ED25519
                key: target,
            }),
            targets: vec![],
        });

        self.append_next(&chain, &doc)?;
        Ok(kind)
    }

    /// The current identity document (the head event's content).
    pub fn current_doc(&self) -> Result<Identity> {
        Ok(head(&self.require_chain()?).doc.clone())
    }

    /// The full identity event chain, genesis first.
    pub fn chain(&self) -> Result<Vec<ChainEntry>> {
        self.load_chain()
    }

    /// The stored private key for a public key (hex). When `public_hex` is
    /// `None`, returns the genesis (primary) rotation key's private key.
    pub fn private_key(&self, public_hex: Option<&str>) -> Result<[u8; PRIVATE_KEY_LEN]> {
        let public = match public_hex {
            Some(hex) => hex::decode(hex.trim())
                .ok()
                .filter(|b| !b.is_empty())
                .ok_or_else(|| anyhow!("invalid public key hex: {hex}"))?,
            None => genesis_key(&self.require_chain()?).key.clone(),
        };
        self.load_private_key(&public)
    }

    /// Publish the full identity event chain to `server` via gRPC PutEvents.
    /// Returns the number of events sent.
    pub fn publish(&self, server: &str) -> Result<usize> {
        crate::polycentric::publish(server, self.export()?)
    }

    /// Every signed event paired with its content, genesis first — ready to
    /// publish to a server or feed to a validator.
    pub fn export(&self) -> Result<Vec<ExportedEvent>> {
        let mut exported = Vec::new();
        for (sequence, signed_event) in self.load_signed_events_seq()? {
            let content = fs::read(self.content_path(sequence))
                .with_context(|| format!("reading content for sequence {sequence}"))?;
            exported.push(ExportedEvent {
                signed_event,
                content,
            });
        }
        Ok(exported)
    }

    // ----- internals -----

    /// Append the next sequential event (signed by the genesis key) carrying
    /// `doc` as its content.
    fn append_next(&self, chain: &[ChainEntry], doc: &Identity) -> Result<()> {
        let identity = self.identity()?;
        let signer = self.genesis_keypair(chain)?;
        let sequence = head(chain).sequence + 1;
        // Rotations are governed by the prior identity content.
        self.append_event(&identity, &signer, sequence, sequence - 1, doc)
    }

    fn append_event(
        &self,
        identity: &str,
        signer: &KeyPair,
        sequence: u64,
        identity_sequence: u64,
        doc: &Identity,
    ) -> Result<()> {
        let content_bytes = identity::content_bytes(doc);
        let content_digest = identity::content_digest(&content_bytes);

        let prior = self.load_signed_events()?;
        let prior_max = max_sequence_by_signer(&prior);
        let vector_clock = event::vector_clock(doc, &signer.to_public_key(), sequence, &prior_max);
        let (previous_signature, previous_root) = event::merkle_anchor(&prior);

        let signed = event::sign(EventParams {
            signer,
            identity,
            collection: IDENTITY,
            sequence,
            identity_sequence,
            vector_clock,
            content_digest,
            previous_signature,
            previous_root,
            created_at: now_ms(),
        });

        let events_dir = self.events_dir();
        fs::create_dir_all(&events_dir)
            .with_context(|| format!("creating {}", events_dir.display()))?;
        restrict_permissions(&events_dir, 0o700);
        fs::write(self.event_path(sequence), signed.encode_to_vec())?;
        fs::write(self.content_path(sequence), content_bytes)?;
        Ok(())
    }

    fn require_chain(&self) -> Result<Vec<ChainEntry>> {
        let chain = self.load_chain()?;
        if chain.is_empty() {
            bail!("no identity yet; run `create` first");
        }
        Ok(chain)
    }

    fn load_chain(&self) -> Result<Vec<ChainEntry>> {
        let mut entries = Vec::new();
        for (sequence, signed) in self.load_signed_events_seq()? {
            let event =
                Event::decode(signed.event_bytes.as_slice()).context("decoding stored event")?;
            let signer = event
                .key
                .and_then(|k| k.signed_by)
                .map(|pk| pk.key)
                .unwrap_or_default();
            let doc = self.load_content_doc(sequence)?;
            entries.push(ChainEntry {
                sequence,
                signer,
                doc,
            });
        }
        Ok(entries)
    }

    fn load_signed_events(&self) -> Result<Vec<SignedEvent>> {
        Ok(self
            .load_signed_events_seq()?
            .into_iter()
            .map(|(_, se)| se)
            .collect())
    }

    /// Load `(sequence, SignedEvent)` pairs, ordered by sequence.
    fn load_signed_events_seq(&self) -> Result<Vec<(u64, SignedEvent)>> {
        let events_dir = self.events_dir();
        if !events_dir.exists() {
            return Ok(Vec::new());
        }
        let mut events = Vec::new();
        for entry in fs::read_dir(&events_dir)
            .with_context(|| format!("reading {}", events_dir.display()))?
        {
            let path = entry?.path();
            let Some(sequence) = path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.strip_suffix(".event"))
                .and_then(|n| n.parse::<u64>().ok())
            else {
                continue;
            };
            let bytes = fs::read(&path).with_context(|| format!("reading {}", path.display()))?;
            let signed =
                SignedEvent::decode(bytes.as_slice()).context("decoding stored signed event")?;
            events.push((sequence, signed));
        }
        events.sort_by_key(|(seq, _)| *seq);
        Ok(events)
    }

    fn load_content_doc(&self, sequence: u64) -> Result<Identity> {
        let path = self.content_path(sequence);
        let bytes = fs::read(&path).with_context(|| format!("reading {}", path.display()))?;
        match Content::decode(bytes.as_slice())
            .context("decoding stored content")?
            .content_body
        {
            Some(ContentBody::Identity(doc)) => Ok(doc),
            _ => bail!("content at sequence {sequence} is not an identity document"),
        }
    }

    /// Reconstruct the genesis (primary) keypair by loading its private key.
    fn genesis_keypair(&self, chain: &[ChainEntry]) -> Result<KeyPair> {
        let public = &genesis_key(chain).key;
        let private = self.load_private_key(public)?;
        Ok(KeyPair::from_private_key(private))
    }

    fn events_signed_by(&self, chain: &[ChainEntry], public: &[u8]) -> Vec<u64> {
        chain
            .iter()
            .filter(|e| e.signer == public)
            .map(|e| e.sequence)
            .collect()
    }

    fn store_private_key(&self, keypair: &KeyPair) -> Result<()> {
        let keys_dir = self.keys_dir();
        fs::create_dir_all(&keys_dir)
            .with_context(|| format!("creating {}", keys_dir.display()))?;
        restrict_permissions(&keys_dir, 0o700);
        let path = keys_dir.join(format!("{}.private", keypair.public_hex()));
        write_private(&path, &keypair.private_key)
    }

    fn load_private_key(&self, public: &[u8]) -> Result<[u8; PRIVATE_KEY_LEN]> {
        let path = self
            .keys_dir()
            .join(format!("{}.private", hex::encode(public)));
        let bytes =
            fs::read(&path).with_context(|| format!("reading private key {}", path.display()))?;
        bytes
            .as_slice()
            .try_into()
            .map_err(|_| anyhow!("private key {} has wrong length", path.display()))
    }

    fn identity_path(&self) -> PathBuf {
        self.dir.join(IDENTITY_FILE)
    }

    fn keys_dir(&self) -> PathBuf {
        self.dir.join(KEYS_DIR)
    }

    fn events_dir(&self) -> PathBuf {
        self.dir.join(EVENTS_DIR)
    }

    fn event_path(&self, sequence: u64) -> PathBuf {
        self.events_dir().join(format!("{sequence:06}.event"))
    }

    fn content_path(&self, sequence: u64) -> PathBuf {
        self.events_dir().join(format!("{sequence:06}.content"))
    }
}

/// The genesis identity event (chain head is last; genesis is first).
fn genesis_key(chain: &[ChainEntry]) -> &PublicKey {
    chain[0]
        .doc
        .rotation_keys
        .first()
        .expect("genesis document always has a primary rotation key")
}

fn head(chain: &[ChainEntry]) -> &ChainEntry {
    chain.last().expect("chain is non-empty")
}

/// Remove the key matching `target` bytes from `keys`; returns whether removed.
fn remove_key(keys: &mut Vec<PublicKey>, target: &[u8]) -> bool {
    let before = keys.len();
    keys.retain(|k| k.key != target);
    keys.len() != before
}

/// Highest sequence each signer reached, keyed by public-key bytes.
fn max_sequence_by_signer(events: &[SignedEvent]) -> HashMap<Vec<u8>, u64> {
    let mut max = HashMap::new();
    for signed in events {
        let Ok(event) = Event::decode(signed.event_bytes.as_slice()) else {
            continue;
        };
        let Some(key) = event.key else { continue };
        let Some(signer) = key.signed_by else {
            continue;
        };
        let entry = max.entry(signer.key).or_insert(0);
        *entry = (*entry).max(key.sequence);
    }
    max
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Write `contents` to `path`, restricting it to the owner on Unix.
fn write_private(path: &Path, contents: &[u8]) -> Result<()> {
    fs::write(path, contents).with_context(|| format!("writing {}", path.display()))?;
    restrict_permissions(path, 0o600);
    Ok(())
}

#[cfg(unix)]
fn restrict_permissions(path: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path, _mode: u32) {}
