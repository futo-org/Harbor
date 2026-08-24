//! Graph-service RPCs (follow-edge listings) surfaced as observables
//! via `Query`.

use std::cmp::Reverse;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    Event, FollowSuggestion, ListFollowersRequest, ListFollowingRequest, ListFollowsResponse,
    PageParams, SuggestFollowRequest, SuggestFollowResponse,
    graph_service_client::GraphServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::query::event::merge::{EventDedupKey, event_dedup_key};
use crate::query::pagination::{FakeCursorToken, merge_page_info, prepare_page_info};
use crate::query::validation::{log_dropped, retain_validated_bundles, retain_validated_hints};
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

/// The server suggests for the authenticated caller, so the identity comes
/// from the auth token rather than the args.
#[derive(Clone, Debug, uniffi::Record)]
pub struct SuggestFollowArgs {
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

/// Concatenate per-server pages, dedupe by `EventKey`, drop invalid
/// bundles, and keep newest-first order.
fn merge_follows_responses(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = ListFollowsResponse::default();

    for v in values {
        if let Ok(incoming) = ListFollowsResponse::decode(v.as_slice()) {
            merged.event_bundles.extend(incoming.event_bundles);
            merged.event_hints.extend(incoming.event_hints);
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

    let mut seen_hints: HashSet<EventDedupKey> = HashSet::new();
    merged.event_hints.retain(
        |hint| match hint.event_bundle.as_ref().and_then(event_dedup_key) {
            Some(k) => seen_hints.insert(k),
            None => true,
        },
    );

    let c = client.lock().unwrap();
    retain_validated_bundles(&c, &mut merged.event_bundles);
    retain_validated_hints(&c, &mut merged.event_hints);
    drop(c);

    merged.encode_to_vec()
}

/// The identity a suggestion is for, i.e. the one to follow.
fn suggestion_identity(suggestion: &FollowSuggestion) -> Option<String> {
    let signed_event = suggestion.suggestion.as_ref()?.signed_event.as_ref()?;
    let event = Event::decode(signed_event.event_bytes.as_slice()).ok()?;
    Some(event.key?.identity)
}

/// Keep the first suggestion per identity whose event validates. An identity
/// has a row per identity event, and every server knows the popular
/// identities, so the same person arrives repeatedly.
fn retain_first_valid_per_identity(
    client: &PolycentricClient,
    suggestions: &mut Vec<FollowSuggestion>,
) {
    let before = suggestions.len();
    let mut first_error: Option<String> = None;
    let mut seen: HashSet<String> = HashSet::new();
    suggestions.retain(|suggestion| {
        let Some(bundle) = suggestion.suggestion.as_ref() else {
            return false;
        };
        let Some(signed_event) = bundle.signed_event.as_ref() else {
            return false;
        };
        if let Err(e) = client.validate_event(signed_event, &bundle.event_proofs) {
            first_error.get_or_insert_with(|| format!("{e:?}"));
            return false;
        }
        match suggestion_identity(suggestion) {
            Some(identity) => seen.insert(identity),
            None => false,
        }
    });
    log_dropped("suggestion", before - suggestions.len(), first_error);
}

/// Concatenate per-server pages, keep one suggestion per identity, drop
/// invalid bundles, and keep the best-connected suggestions first.
fn merge_suggest_follow_responses(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = SuggestFollowResponse::default();

    for v in values {
        if let Ok(incoming) = SuggestFollowResponse::decode(v.as_slice()) {
            merged.suggestions.extend(incoming.suggestions);
            merged.event_hints.extend(incoming.event_hints);
            merged.page_info = merge_page_info(merged.page_info, incoming.page_info);
        }
    }

    // A follower may appear more than once, as an identity can author several
    // valid events following the same identity.
    for suggestion in &mut merged.suggestions {
        let mut seen: HashSet<String> = HashSet::new();
        suggestion
            .followers
            .retain(|follower| seen.insert(follower.clone()));
    }

    // Servers rank by follower count, so ordering the merge that way keeps
    // the ranking and leaves dedupe holding the best-connected duplicate.
    merged
        .suggestions
        .sort_by_key(|suggestion| Reverse(suggestion.followers.len()));

    let mut seen_hints: HashSet<EventDedupKey> = HashSet::new();
    merged.event_hints.retain(
        |hint| match hint.event_bundle.as_ref().and_then(event_dedup_key) {
            Some(k) => seen_hints.insert(k),
            None => true,
        },
    );

    let c = client.lock().unwrap();
    retain_first_valid_per_identity(&c, &mut merged.suggestions);
    retain_validated_hints(&c, &mut merged.event_hints);
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
            let mut response = GraphServiceClient::new(channel(&server_url).await?)
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

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
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
            let mut response = GraphServiceClient::new(channel(&server_url).await?)
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

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
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

    Arc::new(query_client.fetch(query_key, query_fn, merge_follows_responses, opts))
}

/// Identities the authenticated caller could follow — those followed by the
/// identities it already follows. Emits serialized `SuggestFollowResponse`
/// bytes.
pub fn suggest_follow(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: SuggestFollowArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let SuggestFollowArgs {
        limit,
        backward_token,
        forward_token,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = GraphServiceClient::new(channel(&server_url).await?)
                .suggest_follow(SuggestFollowRequest {
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                })
                .await
                .map_err(|e| format!("suggest_follow [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            let bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .chain(
                    response
                        .suggestions
                        .into_iter()
                        .filter_map(|s| s.suggestion),
                )
                .collect();
            client.lock().unwrap().copy_bundles(bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_suggest_follow_responses, opts))
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::{EventBundle, EventKey, PageInfo, SignedEvent};

    fn client() -> Arc<Mutex<PolycentricClient>> {
        Arc::new(Mutex::new(PolycentricClient::new()))
    }

    fn response_from(server: &str, has_next_page: bool) -> Vec<u8> {
        let mut response = ListFollowsResponse {
            event_bundles: Vec::new(),
            event_hints: Vec::new(),
            page_info: Some(PageInfo {
                start_cursor: "start".to_string(),
                end_cursor: "end".to_string(),
                has_previous_page: false,
                has_next_page,
            }),
        };
        prepare_page_info(&mut response.page_info, server, 0, 0).unwrap();
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
            None,
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
        let merged =
            merge_follows_responses(&[vec![0xff], response_from("s", false)], None, &client());
        let response = ListFollowsResponse::decode(merged.as_slice()).unwrap();
        assert!(response.page_info.is_some());
        assert!(response.event_bundles.is_empty());
    }

    fn suggestion_of(identity: &str) -> FollowSuggestion {
        let event = Event {
            key: Some(EventKey {
                identity: identity.to_string(),
                ..Default::default()
            }),
            ..Default::default()
        };
        FollowSuggestion {
            suggestion: Some(EventBundle {
                signed_event: Some(SignedEvent {
                    event_bytes: event.encode_to_vec(),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            followers: Vec::new(),
        }
    }

    #[test]
    fn suggestion_identity_reads_the_event_key() {
        assert_eq!(
            suggestion_identity(&suggestion_of("alice")).as_deref(),
            Some("alice"),
        );
        assert_eq!(suggestion_identity(&FollowSuggestion::default()), None);
    }
}
