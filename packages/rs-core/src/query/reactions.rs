use std::cmp::Reverse;
use std::collections::HashSet;
use std::mem;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    Event, EventBundle, GetReactionsRequest, GetReactionsResponse, PageParams,
    event_sync_service_client::EventSyncServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::query::event::key::EventKey;
use crate::query::event::merge::{merge_event_bundles, merge_event_hints};
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetReactionsArgs {
    /// Event key of the event whose reactions we want.
    pub target: EventKey,
    /// Filter out reactions that don't have this emoji, if provided.
    pub emoji_filter: Option<String>,
    pub limit: Option<i32>,
}

/// Keep only the most recent reaction for each identity
fn retain_newest_reaction_per_identity(bundles: &mut Vec<EventBundle>) {
    // Decode the bundles and extract the fields we need
    let mut decoded = mem::take(bundles)
        .into_iter()
        .filter_map(|bundle| {
            let signed = bundle.signed_event.as_ref()?;
            let event = Event::decode(signed.event_bytes.as_slice()).ok()?;
            let identity = event.key?.identity;

            Some((bundle, identity, event.created_at))
        })
        .collect::<Vec<_>>();

    // Sort from newest to oldest so we can filter out superseded reactions easily
    decoded.sort_by_key(|&(_, _, created_at)| Reverse(created_at));

    let mut seen: HashSet<String> = HashSet::new();
    *bundles = decoded
        .into_iter()
        .filter_map(|(bundle, identity, _)| {
            if seen.insert(identity) {
                Some(bundle)
            } else {
                None
            }
        })
        .collect();
}

/// Merge event bundles as normal, except we also remove reactions that are superseded by newer ones.
fn merge_reaction_responses(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = GetReactionsResponse::default();

    for v in values {
        if let Ok(mut incoming) = GetReactionsResponse::decode(v.as_slice()) {
            merged.event_bundles.append(&mut incoming.event_bundles);
            merged.event_hints.append(&mut incoming.event_hints);
        }
    }

    merge_event_bundles(&mut merged.event_bundles);
    merge_event_hints(&mut merged.event_hints);

    {
        let c = client.lock().unwrap();
        retain_validated_bundles(&c, &mut merged.event_bundles);
        retain_validated_hints(&c, &mut merged.event_hints);
    }

    retain_newest_reaction_per_identity(&mut merged.event_bundles);

    merged.encode_to_vec()
}

/// Get the reaction events targeting a post.
pub fn get_reactions(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetReactionsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetReactionsArgs {
        target,
        emoji_filter,
        limit,
    } = args;

    let request = GetReactionsRequest {
        target: Some(target.into()),
        emoji_filter,
        page_params: Some(PageParams {
            limit,
            backward_token: None,
            forward_token: None,
        }),
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();

        async move {
            let response = EventSyncServiceClient::new(channel(&server_url).await?)
                .get_reactions(request)
                .await
                .map_err(|e| format!("get_reactions [{server_url}]: {e}"))?
                .into_inner();

            let bytes = response.encode_to_vec();

            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();

            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
            }

            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_reaction_responses, opts))
}
