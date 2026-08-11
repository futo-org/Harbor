//! Wraps the rs-common identity validation code to work with database rows.
//! Use this when doing anything with identities.

use polycentric_common::models::identity::{IdentityCandidate, resolve_latest};

use crate::service::feeds::repository::EventWithContentRow;
use crate::service::proto::Identity;

/// Returns the latest valid identity state for `identity` that can be obtained from
/// the rows provided.
pub fn validated_chain_head<'a>(
    identity: &str,
    rows: impl IntoIterator<Item = &'a EventWithContentRow>,
) -> Option<Identity> {
    let candidates = rows.into_iter().filter_map(to_identity_candidate);

    resolve_latest(identity, candidates)
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
