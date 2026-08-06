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

use std::collections::HashMap;

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
/// key of the current head or a re-publish of the previous identity
/// content by a signing key.
pub fn validated_chain_head<'a>(
    identity: &str,
    rows: impl IntoIterator<Item = &'a EventWithContentRow>,
) -> Option<Identity> {
    let decoded: Vec<DecodedIdentityRow> = rows
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

    let rows_by_seq = {
        let mut map: HashMap<u64, Vec<DecodedIdentityRow>> = HashMap::new();

        for row in decoded {
            map.entry(row.sequence).or_default().push(row);
        }

        map
    };

    // Genesis: the earliest event whose Identity content's sha256 matches
    // the identity string.
    let genesis = rows_by_seq
        .values()
        .flatten()
        .filter(|r| identity_matches_content(identity, &r.content))
        .min_by_key(|r| r.sequence)?;

    let mut head = genesis.content.clone();
    let mut head_seq = genesis.sequence;
    loop {
        let next_seq = head_seq + 1;
        let Some(candidates) = rows_by_seq.get(&next_seq) else {
            break;
        };

        let next = candidates
            .iter()
            .filter(|r| {
                if head.authorizes_rotation(&r.signer) {
                    // A rotation key can always create a new identity document
                    true
                } else {
                    // Permit even a non-rotation key to add to the chain if it
                    // doesn't change anything
                    r.content == head && head.authorizes_signer(&r.signer)
                }
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
