//! Publishing the identity event chain to a Polycentric server.

use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use ed25519_dalek::SigningKey;
use polycentric_common::jwt::mint_jwt;
use polycentric_common::models::protos_v2::{EventBundle, SerializedContent};
use polycentric_core::sync::push_bundles_as;

use crate::store::ExportedEvent;

const TOKEN_TTL_SECS: u64 = 300;

/// Push `events` (signed events with their content) to `server` via the gRPC
/// `PutEvents` RPC, authenticated as `identity` with `key`. Returns the
/// number of events sent.
pub fn publish(
    server: &str,
    events: Vec<ExportedEvent>,
    identity: &str,
    key: &SigningKey,
) -> Result<usize> {
    let event_bundles: Vec<EventBundle> = events
        .into_iter()
        .map(|e| EventBundle {
            signed_event: Some(e.signed_event),
            serialized_content: Some(SerializedContent {
                content_bytes: e.content,
            }),
            event_proofs: vec![],
            meta: None,
        })
        .collect();
    let count = event_bundles.len();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let token = mint_jwt(key, identity, server, now, TOKEN_TTL_SECS);

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| anyhow!("building async runtime: {e}"))?;
    runtime
        .block_on(push_bundles_as(server, event_bundles, &token))
        .map_err(|e| anyhow!("publishing to {server}: {e}"))?;
    Ok(count)
}
