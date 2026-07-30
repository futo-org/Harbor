//! Pure identity-chain validation, with no database or service
//! dependencies so both the repository (DB) and service layers can share
//! one copy. Given an identity's IDENTITY-collection event rows, walk the
//! chain from genesis and return the validated head content.
//!
//! This is the single source of truth for "what does this identity
//! currently authorize". It is security-critical: it is what turns "some
//! key signed this" into "this identity vouches for that key" for auth,
//! event-write authorization, and revocation proofs. Any caller that
//! caches identity content MUST route it through here first — caching raw
//! events (e.g. the highest-sequence one) would let a forged,
//! unauthorized IDENTITY event impersonate the identity.

use crate::service::feeds::repository::EventWithContentRow;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{Content, Identity, PublicKey};
use prost::Message;
use sha2::{Digest, Sha256};

struct DecodedIdentityRow {
    sequence: u64,
    signer: PublicKey,
    content: Identity,
}

/// Walk the identity chain over `rows` (an identity's complete
/// IDENTITY-collection events, in any order) and return the head's
/// content, or `None` when no valid genesis exists.
///
/// Genesis is the event whose Identity content hashes to `identity`;
/// each successor must be at the next sequence and signed by a rotation
/// key of the current head. An event that is not reachable this way —
/// including a forged high-sequence event signed by an unauthorized key
/// — is ignored.
pub fn validated_chain_head<'a>(
    identity: &str,
    rows: impl IntoIterator<Item = &'a EventWithContentRow>,
) -> Option<Identity> {
    let mut decoded: Vec<DecodedIdentityRow> = rows
        .into_iter()
        .filter_map(|(event, content)| {
            let content_row = content.as_ref()?;
            let signer = PublicKey {
                key_type: event.public_key_type as i32,
                key: event.public_key.clone(),
            };
            let content_msg =
                Content::decode(content_row.serialized_bytes.as_slice())
                    .ok()?;
            let identity_content = match content_msg.content_body? {
                ContentBody::Identity(i) => i,
                _ => return None,
            };
            Some(DecodedIdentityRow {
                sequence: event.sequence as u64,
                signer,
                content: identity_content,
            })
        })
        .collect();
    decoded.sort_by_key(|r| r.sequence);

    // Genesis: the earliest event whose Identity content's sha256 matches
    // the identity string.
    let genesis = decoded
        .iter()
        .find(|r| identity_matches_content(identity, &r.content))?;

    let mut head = genesis.content.clone();
    let mut head_seq = genesis.sequence;
    loop {
        let next_seq = head_seq + 1;
        let next = decoded
            .iter()
            .filter(|r| {
                r.sequence == next_seq && authorizes_rotation(&head, &r.signer)
            })
            .min_by(|a, b| a.signer.key.cmp(&b.signer.key));
        match next {
            Some(e) => {
                head = e.content.clone();
                head_seq = next_seq;
            }
            None => break,
        }
    }
    Some(head)
}

/// True when `identity` is the hex sha256 of the encoded `Identity`
/// content (the canonical genesis-identifier convention).
fn identity_matches_content(identity: &str, content: &Identity) -> bool {
    let mut h = Sha256::new();
    h.update(content.encode_to_vec());
    let hex: String =
        h.finalize().iter().map(|b| format!("{:02x}", b)).collect();
    hex == identity
}

fn authorizes_rotation(content: &Identity, signer: &PublicKey) -> bool {
    content
        .rotation_keys
        .iter()
        .any(|k| k.key_type == signer.key_type && k.key == signer.key)
}
