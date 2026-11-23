use polycentric_common::models::{
    collections,
    protos_v2::{PutEventError, PutEventsRequest, PutEventsResponse},
};
use std::collections::{BTreeMap, HashMap, btree_map::Entry};

use polycentric_common::models::protos_v2::{
    EventBundle, EventKey, ListHeadsRequest, PublicKey,
    event_sync_service_client::EventSyncServiceClient,
};

use crate::{
    api::CoreError,
    client::PolycentricClient,
    query::{
        channel,
        event::{key::EventKey as FfiEventKey, merge::decode_event},
    },
};

/// The server's complaints about a single pushed event.
#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct EventPushIssues {
    pub key: FfiEventKey,
    /// If `errors` is not empty, the server did not store the event for the reasons listed.
    pub errors: Vec<String>,
    /// If `warnings` is not empty, the server may have stored the event (if there were no errors),
    /// but dropped the content for the reasons listed.
    pub warnings: Vec<String>,
}

/// Wrapper for executing a list_heads RPC
pub async fn request_heads(identity: &str, server: &str) -> Result<Vec<EventKey>, CoreError> {
    let mut rpc_client =
        EventSyncServiceClient::new(channel(server).await.map_err(CoreError::Network)?);

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

            for (event_key, signed_event) in unsent_events {
                let bundle = client
                    .bundle_for(event_key, signed_event, false)
                    .map_err(|e| CoreError::Decode(format!("decode local event: {e}")))?;
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
    for (event_key, signed_event) in local_events {
        let bundle = client
            .bundle_for(event_key, signed_event, false)
            .map_err(|e| CoreError::Decode(format!("decode local event: {e}")))?;
        bundles.push(bundle);
    }

    Ok(bundles)
}

/// Events sent per `put_events` request.
const PUSH_BATCH_SIZE: usize = 200;

/// Send event bundles to server, [`PUSH_BATCH_SIZE`] per request and in
/// order. The responses are returned as one, as if for a single request.
pub async fn push_bundles(
    server: &str,
    mut bundles: Vec<EventBundle>,
) -> Result<PutEventsResponse, CoreError> {
    let mut rpc_client =
        EventSyncServiceClient::new(channel(server).await.map_err(CoreError::Network)?);

    let mut merged = PutEventsResponse::default();
    let mut sent = 0;
    loop {
        let rest = bundles.split_off(bundles.len().min(PUSH_BATCH_SIZE));
        let batch_len = bundles.len();
        let response = rpc_client
            .put_events(PutEventsRequest {
                event_bundles: bundles,
            })
            .await
            .map_err(|e| CoreError::Network(format!("sync: put_events: {e}")))?
            .into_inner();
        merge_response(&mut merged, response, sent as u32);

        sent += batch_len;
        bundles = rest;
        if bundles.is_empty() {
            return Ok(merged);
        }
    }
}

/// Add the `response` of the batch that started at bundle `offset` to `merged`.
fn merge_response(merged: &mut PutEventsResponse, response: PutEventsResponse, offset: u32) {
    let at_offset = |mut issue: PutEventError| {
        issue.event_bundle_index += offset;
        issue
    };
    merged
        .errors
        .extend(response.errors.into_iter().map(at_offset));
    merged
        .warnings
        .extend(response.warnings.into_iter().map(at_offset));
    // Batches can ask for the same blob.
    for blob in response.requested_blobs {
        if !merged.requested_blobs.contains(&blob) {
            merged.requested_blobs.push(blob);
        }
    }
}

/// Decode the key of the event in `bundle`.
pub fn bundle_key(bundle: &EventBundle) -> Option<FfiEventKey> {
    FfiEventKey::from_proto(decode_event(bundle)?.key?)
}

/// Explicitly map all errors and warnings received from the server to the event they reference by
/// returning a list of [`EventPushIssues`]. Returns the events that received issues in the order
/// they were pushed.
pub fn map_event_push_issues(
    keys: &[Option<FfiEventKey>],
    response: &PutEventsResponse,
) -> Vec<EventPushIssues> {
    // Using a BTreeMap, the bundle index keys will sort all issues into push order
    let mut by_index: BTreeMap<u32, EventPushIssues> = BTreeMap::new();

    let errors = response.errors.iter().map(|e| (e, true));
    let warnings = response.warnings.iter().map(|w| (w, false));
    for (issue, is_error) in errors.chain(warnings) {
        let index = issue.event_bundle_index;
        let entry = match by_index.entry(index) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => {
                let Some(key) = keys.get(index as usize).cloned().flatten() else {
                    crate::logging::log_warn(|| {
                        format!(
                            "push issue for unknown event bundle {index}: {}",
                            issue.message
                        )
                    });
                    continue;
                };
                entry.insert(EventPushIssues {
                    key,
                    errors: vec![],
                    warnings: vec![],
                })
            }
        };
        if is_error {
            entry.errors.push(issue.message.clone());
        } else {
            entry.warnings.push(issue.message.clone());
        }
    }

    by_index.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query::event::key::PublicKey as FfiPublicKey;
    use polycentric_common::models::protos_v2::PutEventError;

    fn key(sequence: u64) -> FfiEventKey {
        FfiEventKey {
            collection: collections::IDENTITY,
            identity: "identity".to_string(),
            signed_by: FfiPublicKey {
                key_type: 1,
                key: vec![1, 2, 3],
            },
            sequence,
        }
    }

    fn issue(event_bundle_index: u32, message: &str) -> PutEventError {
        PutEventError {
            event_bundle_index,
            message: message.to_string(),
        }
    }

    #[test]
    fn merges_batch_responses_as_one() {
        use polycentric_common::models::protos_v2::Blob;

        let blob = |size| Blob {
            size,
            ..Default::default()
        };
        let mut merged = PutEventsResponse::default();
        merge_response(
            &mut merged,
            PutEventsResponse {
                errors: vec![issue(3, "first batch")],
                requested_blobs: vec![blob(1), blob(2)],
                warnings: vec![],
            },
            0,
        );
        merge_response(
            &mut merged,
            PutEventsResponse {
                errors: vec![issue(0, "second batch")],
                requested_blobs: vec![blob(2), blob(3)],
                warnings: vec![issue(199, "second batch")],
            },
            200,
        );

        assert_eq!(
            merged,
            PutEventsResponse {
                errors: vec![issue(3, "first batch"), issue(200, "second batch")],
                requested_blobs: vec![blob(1), blob(2), blob(3)],
                warnings: vec![issue(399, "second batch")],
            }
        );
    }

    #[test]
    fn groups_issues_by_event_in_push_order() {
        let keys = vec![Some(key(1)), Some(key(2)), Some(key(3))];
        let response = PutEventsResponse {
            errors: vec![issue(2, "bad signature"), issue(0, "too long")],
            warnings: vec![issue(0, "app name dropped"), issue(2, "unknown field")],
            requested_blobs: vec![],
        };

        assert_eq!(
            map_event_push_issues(&keys, &response),
            vec![
                EventPushIssues {
                    key: key(1),
                    errors: vec!["too long".to_string()],
                    warnings: vec!["app name dropped".to_string()],
                },
                EventPushIssues {
                    key: key(3),
                    errors: vec!["bad signature".to_string()],
                    warnings: vec!["unknown field".to_string()],
                },
            ]
        );
    }

    #[test]
    fn drops_issues_for_unknown_bundles() {
        let keys = vec![Some(key(1)), None];
        let response = PutEventsResponse {
            errors: vec![issue(1, "undecodable"), issue(7, "out of range")],
            warnings: vec![],
            requested_blobs: vec![],
        };

        assert!(map_event_push_issues(&keys, &response).is_empty());
    }
}
