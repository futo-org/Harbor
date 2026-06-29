use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    ListClaimsRequest, ListClaimsResponse, verifications_service_client::VerificationsServiceClient,
};
use prost::Message;

use crate::query::event::dedup::{EventDedupKey, event_dedup_key};
use crate::query::validation::retain_validated_bundles;
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListClaimsArgs {
    pub claimed_by_identity: String,
}

/// Merge `ListClaimsResponse` payloads from every server: concatenate
/// the bundles, dedupe by `EventKey`, then drop any that fail signature
/// / proof validation against the local client state.
fn merge_list_claims_responses(
    values: &[Vec<u8>],
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = ListClaimsResponse::default();
    for v in values {
        if let Ok(incoming) = ListClaimsResponse::decode(v.as_slice()) {
            merged.event_bundles.extend(incoming.event_bundles);
        }
    }

    let mut seen: HashSet<EventDedupKey> = HashSet::new();
    merged
        .event_bundles
        .retain(|bundle| match event_dedup_key(bundle) {
            Some(k) => seen.insert(k),
            None => true,
        });

    let c = client.lock().unwrap();
    retain_validated_bundles(&c, &mut merged.event_bundles);
    drop(c);

    merged.encode_to_vec()
}

/// List the verification claims created by `claimed_by_identity` across
/// the configured servers. Emits serialized `ListClaimsResponse` proto
/// bytes with `event_bundles` deduped by `EventKey` and validated.
pub fn list_claims(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListClaimsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = ListClaimsRequest {
        claimed_by_identity: args.claimed_by_identity,
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = VerificationsServiceClient::new(channel(&server_url)?)
                .list_claims(request)
                .await
                .map_err(|e| format!("list_claims [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(response.event_bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_list_claims_responses, opts))
}
