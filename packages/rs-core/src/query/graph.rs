//! Graph-service RPCs (follow-edge listings) surfaced as observables
//! via `Query`.

use std::cmp::Reverse;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    Event, ListFollowersRequest, ListFollowingRequest, ListFollowsResponse, PageParams,
    graph_service_client::GraphServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::query::event::dedup::{EventDedupKey, event_dedup_key};
use crate::query::feed::{FakeCursorToken, merge_page_info};
use crate::query::validation::retain_validated_bundles;
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListFollowingArgs {
    pub identity: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListFollowersArgs {
    pub identity: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

/// Replace the server's cursor tokens with fake aggregate ones so the
/// response can be merged with other servers' responses.
fn prepare_page_info(
    response: &mut ListFollowsResponse,
    server_url: &str,
    backward_offset: i32,
    forward_offset: i32,
) -> Result<(), String> {
    if let Some(i) = response.page_info.as_mut() {
        i.start_cursor = FakeCursorToken::encode_new(
            server_url,
            &i.start_cursor,
            backward_offset - 1,
            i.has_previous_page,
        )?;

        i.end_cursor = FakeCursorToken::encode_new(
            server_url,
            &i.end_cursor,
            forward_offset + 1,
            i.has_next_page,
        )?;
    }

    Ok(())
}

/// Concatenate per-server pages, dedupe by `EventKey`, drop invalid
/// bundles, and keep newest-first order.
fn merge_follows_responses(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    let mut merged = ListFollowsResponse::default();

    for v in values {
        if let Ok(incoming) = ListFollowsResponse::decode(v.as_slice()) {
            merged.event_bundles.extend(incoming.event_bundles);
            merged.page_info = merge_page_info(merged.page_info, incoming.page_info);
        }
    }

    let mut seen: HashSet<EventDedupKey> = HashSet::new();
    merged
        .event_bundles
        .retain(|bundle| match event_dedup_key(bundle) {
            Some(k) => seen.insert(k),
            None => true,
        });

    merged.event_bundles.sort_by_cached_key(|bundle| {
        let created_at = bundle
            .signed_event
            .as_ref()
            // Events we cannot decode will be mapped to `None` and sorted at the end.
            .and_then(|se| Event::decode(se.event_bytes.as_slice()).ok())
            .map(|event| event.created_at);

        Reverse(created_at)
    });

    let c = client.lock().unwrap();
    retain_validated_bundles(&c, &mut merged.event_bundles);
    drop(c);

    merged.encode_to_vec()
}

/// Follow events authored by an identity — who they follow. Emits
/// serialized `ListFollowsResponse` bytes.
pub fn list_following(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListFollowingArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListFollowingArgs {
        identity,
        limit,
        backward_token,
        forward_token,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = GraphServiceClient::new(channel(&server_url)?)
                .list_following(ListFollowingRequest {
                    identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                })
                .await
                .map_err(|e| format!("list_following [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(&mut response, &server_url, backward_offset, forward_offset)?;
            let bytes = response.encode_to_vec();

            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_follows_responses, opts))
}

/// Follow events targeting an identity — who follows them. Emits
/// serialized `ListFollowsResponse` bytes.
pub fn list_followers(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListFollowersArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListFollowersArgs {
        identity,
        limit,
        backward_token,
        forward_token,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = GraphServiceClient::new(channel(&server_url)?)
                .list_followers(ListFollowersRequest {
                    identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                })
                .await
                .map_err(|e| format!("list_followers [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(&mut response, &server_url, backward_offset, forward_offset)?;
            let bytes = response.encode_to_vec();

            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_follows_responses, opts))
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::PageInfo;

    fn client() -> Arc<Mutex<PolycentricClient>> {
        Arc::new(Mutex::new(PolycentricClient::new()))
    }

    fn response_from(server: &str, has_next_page: bool) -> Vec<u8> {
        let mut response = ListFollowsResponse {
            event_bundles: Vec::new(),
            page_info: Some(PageInfo {
                start_cursor: "start".to_string(),
                end_cursor: "end".to_string(),
                has_previous_page: false,
                has_next_page,
            }),
        };
        prepare_page_info(&mut response, server, 0, 0).unwrap();
        response.encode_to_vec()
    }

    #[test]
    fn prepare_page_info_fakes_the_server_cursors() {
        let bytes = response_from("server-a", true);
        let response = ListFollowsResponse::decode(bytes.as_slice()).unwrap();
        let page_info = response.page_info.unwrap();

        let (token, offset) = FakeCursorToken::extract(&Some(page_info.end_cursor), "server-a");
        assert_eq!(token.as_deref(), Some("end"));
        assert_eq!(offset, 1);

        let (token, offset) = FakeCursorToken::extract(&Some(page_info.start_cursor), "server-a");
        assert_eq!(token.as_deref(), Some("start"));
        assert_eq!(offset, -1);
    }

    #[test]
    fn merge_combines_page_infos_across_servers() {
        let merged = merge_follows_responses(
            &[
                response_from("server-a", true),
                response_from("server-b", false),
            ],
            &client(),
        );
        let response = ListFollowsResponse::decode(merged.as_slice()).unwrap();
        let page_info = response.page_info.unwrap();

        // Any server with more data leaves the merged page open.
        assert!(page_info.has_next_page);

        // Both servers' real cursors survive in the aggregate token.
        let (token_a, _) =
            FakeCursorToken::extract(&Some(page_info.end_cursor.clone()), "server-a");
        let (token_b, _) = FakeCursorToken::extract(&Some(page_info.end_cursor), "server-b");
        assert_eq!(token_a.as_deref(), Some("end"));
        assert_eq!(token_b.as_deref(), Some("end"));
    }

    #[test]
    fn merge_ignores_undecodable_responses() {
        let merged = merge_follows_responses(&[vec![0xff], response_from("s", false)], &client());
        let response = ListFollowsResponse::decode(merged.as_slice()).unwrap();
        assert!(response.page_info.is_some());
        assert!(response.event_bundles.is_empty());
    }
}
