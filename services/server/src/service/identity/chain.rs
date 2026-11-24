//! Wraps the rs-common identity validation code to work with database rows.
//! Use this when doing anything with identities.

use polycentric_common::models::identity::{IdentityCandidate, resolve_chain};

use crate::data::EventWithContentRow;
use crate::service::proto::Identity;

/// Returns the latest valid identity state for `identity` that can be obtained from
/// the rows provided, with the id of the event that holds it.
pub fn validated_chain_head(
    identity: &str,
    rows: &[EventWithContentRow],
) -> Option<(i64, Identity)> {
    let candidates = rows.iter().filter_map(to_identity_candidate);
    let chain = resolve_chain(identity, candidates)?;
    let head = chain.latest_event()?;
    let (event, _) = rows.iter().find(|(event, _)| {
        event.sequence as u64 == head.sequence
            && event.public_key_type as i32 == head.signer.key_type
            && event.public_key == head.signer.key
    })?;
    Some((event.id, head.document.clone()))
}

fn to_identity_candidate<'a>(
    row: &'a EventWithContentRow,
) -> Option<IdentityCandidate<'a>> {
    let (event, content) = row;
    let content = content.as_ref()?;

    let candidate = IdentityCandidate {
        event_bytes: &event.event_bytes,
        content_bytes: &content.serialized_bytes,
        signature: &event.signature,
    };

    Some(candidate)
}
