//! Publishing the identity event chain to a Polycentric server.

use anyhow::{anyhow, Result};
use polycentric_common::models::protos_v2::{EventBundle, PutEventsRequest, SerializedContent};
use polycentric_core::api::PolycentricCore;
use prost::Message;

use crate::store::ExportedEvent;

/// Push `events` (signed events with their content) to `server` via the gRPC
/// `PutEvents` RPC. Returns the number of events sent.
pub fn publish(server: &str, events: Vec<ExportedEvent>) -> Result<usize> {
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
    let request = PutEventsRequest { event_bundles }.encode_to_vec();

    let core = PolycentricCore::new();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| anyhow!("building async runtime: {e}"))?;
    runtime
        .block_on(core.put_events(server.to_string(), request))
        .map_err(|e| anyhow!("publishing to {server}: {e}"))?;
    Ok(count)
}
