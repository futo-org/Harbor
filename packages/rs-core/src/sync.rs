use polycentric_common::models::{
    collections,
    protos_v2::{PutEventsRequest, PutEventsResponse, SignedEvent},
};
use prost::Message;
use std::collections::HashMap;

use polycentric_common::models::protos_v2::{
    Event, EventBundle, EventKey, ListHeadsRequest, PublicKey,
    event_sync_service_client::EventSyncServiceClient,
};

use crate::{api::CoreError, client::PolycentricClient, query::channel};

/// Wrapper for executing a list_heads RPC
pub async fn request_heads(identity: &str, server: &str) -> Result<Vec<EventKey>, CoreError> {
    let mut rpc_client = EventSyncServiceClient::new(channel(server).map_err(CoreError::Network)?);

    let request = ListHeadsRequest {
        identity: identity.to_string(),
    };

    let response = rpc_client
        .list_heads(request)
        .await
        .map_err(|e| CoreError::Network(format!("push_local_events: list_heads: {e}")))?;

    Ok(response.into_inner().heads)
}

/// Gather all the event bundles to send to a server based on the
/// sequence heads it provided to us.
/// This includes events past the provided heads and blobs referenced by those events.
/// Gaps or other unsent blobs are not handled.
pub fn bundle_unsent_events(
    client: &PolycentricClient,
    identity: &str,
    heads: Vec<EventKey>,
) -> Result<Vec<EventBundle>, CoreError> {
    // Get rid of the annoying `Option` for `signed_by` and keep only the fields we need
    let heads = heads
        .into_iter()
        .filter_map(|key| key.signed_by.map(|pk| (key.collection, pk, key.sequence)))
        .collect::<Vec<_>>();

    // Map signers to head sequence number for efficient lookup
    let heads_map = heads
        .iter()
        .map(|(col, signer, seq)| ((*col, signer), *seq))
        .collect::<HashMap<(i32, &PublicKey), u64>>();

    let (mut local_collections, local_signers) = client.find_collections_and_signers(identity);

    // Ensure that identity events are bundled first so that the server has the identity information
    // that it needs in order to validate the other events.
    let identity_idx = local_collections
        .iter()
        .position(|col| *col == collections::IDENTITY);
    if let Some(idx) = identity_idx {
        local_collections.swap(0, idx);
    }

    let mut bundles = vec![];

    for col in local_collections {
        for signer in &local_signers {
            let server_latest = *heads_map.get(&(col, signer)).unwrap_or(&0u64);

            let unsent_events =
                client.get_sync_events(identity, col, signer.key_type, &signer.key, server_latest);

            for (_, signed_event) in unsent_events {
                let bundle = bundle_from_signed_event(client, signed_event.clone())?;
                bundles.push(bundle);
            }
        }
    }

    Ok(bundles)
}

/// Gather all local events for an identity and prepare them for sending to servers
pub fn bundle_local_events(
    client: &PolycentricClient,
    identity: &str,
) -> Result<Vec<EventBundle>, CoreError> {
    let local_events = client.get_local_events(identity);

    let mut bundles = vec![];
    for (_, signed_event) in local_events {
        let bundle = bundle_from_signed_event(client, signed_event.clone())?;
        bundles.push(bundle);
    }

    Ok(bundles)
}

fn bundle_from_signed_event(
    client: &PolycentricClient,
    signed_event: SignedEvent,
) -> Result<EventBundle, CoreError> {
    let event_bytes = &signed_event.event_bytes;
    let event = Event::decode(event_bytes.as_slice())
        .map_err(|e| CoreError::Decode(format!("decode local event: {e}")))?;

    let serialized_content = event
        .content_digest
        .and_then(|digest| client.find_content_from_digest(&digest));

    Ok(EventBundle {
        signed_event: Some(signed_event),
        serialized_content,
        event_proofs: vec![],
    })
}

/// Send event bundles to server
pub async fn push_bundles(
    server: &str,
    bundles: Vec<EventBundle>,
) -> Result<PutEventsResponse, CoreError> {
    let req = PutEventsRequest {
        event_bundles: bundles,
    };

    let mut rpc_client = EventSyncServiceClient::new(channel(server).map_err(CoreError::Network)?);

    let response = rpc_client
        .put_events(req)
        .await
        .map_err(|e| CoreError::Network(format!("sync: put_events: {e}")))?
        .into_inner();

    Ok(response)
}
