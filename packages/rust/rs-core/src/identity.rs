use polycentric_common::{
    error::CoreError,
    models::{
        collections,
        identity::{IdentityCandidate, IdentityChain, resolve_chain},
        protos_v2::{Event, SignedEvent},
    },
};
use prost::Message;

use crate::store::{content_store::ContentStore, event_store::EventStore};

/// Resolve the identity chain for `identity` using the local event and content stores.
pub fn resolve_identity_chain(
    identity: &str,
    event_store: &EventStore,
    content_store: &ContentStore,
) -> Result<IdentityChain, CoreError> {
    let candidates = event_store
        .by_identity_and_collection(identity, collections::IDENTITY)
        .filter_map(|(_, signed)| to_identity_candidate(signed, content_store));

    resolve_chain(identity, candidates).ok_or_else(|| {
        CoreError::InvalidEvent(format!("No valid identity chain for identity {identity}"))
    })
}

fn to_identity_candidate<'a>(
    signed: &'a SignedEvent,
    content_store: &'a ContentStore,
) -> Option<IdentityCandidate<'a>> {
    let event = Event::decode(signed.event_bytes.as_slice()).ok()?;
    let digest = event.content_digest?;
    let content_bytes = content_store.get(&digest)?;

    let candidate = IdentityCandidate {
        event_bytes: &signed.event_bytes,
        content_bytes,
        signature: &signed.signature,
    };

    Some(candidate)
}
