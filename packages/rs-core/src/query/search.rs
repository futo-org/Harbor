//! Search-service RPCs surfaced as observables via `Query`.

use std::cmp::Reverse;
use std::collections::HashMap;
use std::mem;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, EventHint, PageInfo, PageParams, SearchPostsRequest,
    SearchPostsResponse, SearchResult, SearchUsersRequest, SearchUsersResponse, SortPostsBy,
    SortUsersBy, content, search_service_client::SearchServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::query::event::merge::{
    EventDedupKey, copy_hints, event_dedup_key, merge_bundle, merge_event_hints,
};
use crate::query::pagination::{FakeCursorToken, merge_page_info, prepare_page_info};
use crate::query::validation::retain_validated_hints;
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum SearchPostsSort {
    Default,
    Latest,
}

impl From<SearchPostsSort> for SortPostsBy {
    fn from(sort: SearchPostsSort) -> Self {
        match sort {
            SearchPostsSort::Default => SortPostsBy::Default,
            SearchPostsSort::Latest => SortPostsBy::Latest,
        }
    }
}

#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum SearchUsersSort {
    Default,
    Alpha,
}

impl From<SearchUsersSort> for SortUsersBy {
    fn from(sort: SearchUsersSort) -> Self {
        match sort {
            SearchUsersSort::Default => SortUsersBy::Default,
            SearchUsersSort::Alpha => SortUsersBy::Alpha,
        }
    }
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct SearchPostsArgs {
    pub query: String,
    pub sort_by: Option<SearchPostsSort>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct SearchUsersArgs {
    pub query: String,
    pub sort_by: Option<SearchUsersSort>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

fn copy_result_bundles(client: &Arc<Mutex<PolycentricClient>>, results: &[SearchResult]) {
    let bundles: Vec<EventBundle> = results
        .iter()
        .filter_map(|r| r.event_bundle.clone())
        .collect();

    if !bundles.is_empty() {
        client.lock().unwrap().copy_bundles(bundles);
    }
}

/// Assume the event keys are the same and merge, keeping the best rank.
fn merge_search_result(left: SearchResult, right: SearchResult) -> SearchResult {
    let event_bundle = match (left.event_bundle, right.event_bundle) {
        (Some(l), Some(r)) => Some(merge_bundle(l, r)),
        (l, r) => l.or(r),
    };

    SearchResult {
        event_bundle,
        rank: left.rank.max(right.rank),
    }
}

/// Deduplicate `results`, merging all results whose bundles share an
/// event key. This function does *not* validate the bundles.
fn merge_search_results(results: &mut Vec<SearchResult>) {
    let original: Vec<SearchResult> = mem::take(results);

    let mut index: HashMap<EventDedupKey, usize> = HashMap::new();

    for result in original {
        match result.event_bundle.as_ref().and_then(event_dedup_key) {
            Some(k) => match index.get(&k) {
                Some(&i) => {
                    let existing = mem::take(&mut results[i]);
                    results[i] = merge_search_result(existing, result);
                }
                None => {
                    index.insert(k, results.len());
                    results.push(result);
                }
            },
            None => results.push(result),
        }
    }
}

/// Retain only results whose signed event passes `validate_event`.
fn retain_validated_results(client: &PolycentricClient, results: &mut Vec<SearchResult>) {
    results.retain(|r| {
        match r
            .event_bundle
            .as_ref()
            .and_then(|b| b.signed_event.as_ref().map(|se| (b, se)))
        {
            Some((b, se)) => client.validate_event(se, &b.event_proofs).is_ok(),
            None => false,
        }
    });
}

fn result_created_at(result: &SearchResult) -> Option<u64> {
    result
        .event_bundle
        .as_ref()?
        .signed_event
        .as_ref()
        .and_then(|se| Event::decode(se.event_bytes.as_slice()).ok())
        .map(|event| event.created_at)
}

fn result_profile_name(result: &SearchResult) -> Option<String> {
    let content_bytes = &result
        .event_bundle
        .as_ref()?
        .serialized_content
        .as_ref()?
        .content_bytes;

    match Content::decode(content_bytes.as_slice())
        .ok()?
        .content_body?
    {
        content::ContentBody::ProfileUpdate(profile) => profile.name.map(|n| n.to_lowercase()),
        _ => None,
    }
}

fn sort_by_rank(results: &mut [SearchResult]) {
    results.sort_by(|a, b| b.rank.total_cmp(&a.rank));
}

fn sort_by_created_at(results: &mut [SearchResult]) {
    results.sort_by_cached_key(|r| Reverse(result_created_at(r)));
}

/// Alphabetic by profile name; results without a decodable name last.
fn sort_by_profile_name(results: &mut [SearchResult]) {
    results.sort_by_cached_key(|r| match result_profile_name(r) {
        Some(name) => (0, name),
        None => (1, String::new()),
    });
}

/// Responses carrying `results` + `event_hints` + `page_info`.
trait SearchResponse: Message + Default {
    fn results_mut(&mut self) -> &mut Vec<SearchResult>;
    fn hints_mut(&mut self) -> &mut Vec<EventHint>;
    fn page_info_mut(&mut self) -> &mut Option<PageInfo>;
}

impl SearchResponse for SearchPostsResponse {
    fn results_mut(&mut self) -> &mut Vec<SearchResult> {
        &mut self.results
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
    fn page_info_mut(&mut self) -> &mut Option<PageInfo> {
        &mut self.page_info
    }
}

impl SearchResponse for SearchUsersResponse {
    fn results_mut(&mut self) -> &mut Vec<SearchResult> {
        &mut self.results
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
    fn page_info_mut(&mut self) -> &mut Option<PageInfo> {
        &mut self.page_info
    }
}

/// Concatenate per-server results, dedupe by `EventKey`, drop invalid
/// bundles, and apply `sort` to the merged results.
fn do_search_merge<T: SearchResponse>(
    values: &[Vec<u8>],
    client: &Arc<Mutex<PolycentricClient>>,
    sort: impl Fn(&mut [SearchResult]),
) -> Vec<u8> {
    let mut merged = T::default();

    for v in values {
        if let Ok(mut incoming) = T::decode(v.as_slice()) {
            merged.results_mut().append(incoming.results_mut());
            merged.hints_mut().append(incoming.hints_mut());
            *merged.page_info_mut() = merge_page_info(
                merged.page_info_mut().take(),
                incoming.page_info_mut().take(),
            );
        }
    }

    merge_search_results(merged.results_mut());
    merge_event_hints(merged.hints_mut());

    {
        let c = client.lock().unwrap();
        retain_validated_results(&c, merged.results_mut());
        retain_validated_hints(&c, merged.hints_mut());
    }

    sort(merged.results_mut());

    merged.encode_to_vec()
}

/// Full-text search over posts.
pub fn search_posts(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: SearchPostsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let SearchPostsArgs {
        query,
        sort_by,
        limit,
        backward_token,
        forward_token,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let query = query.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = SearchServiceClient::new(channel(&server_url).await?)
                .search_posts(SearchPostsRequest {
                    query,
                    sort_by: sort_by.map(|s| SortPostsBy::from(s) as i32),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                })
                .await
                .map_err(|e| format!("search_posts [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            copy_result_bundles(&client, &response.results);
            Ok(bytes)
        }
    };

    let sort = sort_by.unwrap_or(SearchPostsSort::Default);
    let merge_fn = move |values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>| {
        do_search_merge::<SearchPostsResponse>(values, client, |results| match sort {
            SearchPostsSort::Default => sort_by_rank(results),
            SearchPostsSort::Latest => sort_by_created_at(results),
        })
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}

/// Full-text search over user profiles. Results are `ProfileUpdate`
/// event bundles; the author identity is the matched user.
pub fn search_users(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: SearchUsersArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let SearchUsersArgs {
        query,
        sort_by,
        limit,
        backward_token,
        forward_token,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let query = query.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = SearchServiceClient::new(channel(&server_url).await?)
                .search_users(SearchUsersRequest {
                    query,
                    sort_by: sort_by.map(|s| SortUsersBy::from(s) as i32),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                })
                .await
                .map_err(|e| format!("search_users [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            copy_result_bundles(&client, &response.results);
            Ok(bytes)
        }
    };

    let sort = sort_by.unwrap_or(SearchUsersSort::Default);
    let merge_fn = move |values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>| {
        do_search_merge::<SearchUsersResponse>(values, client, |results| match sort {
            SearchUsersSort::Default => sort_by_rank(results),
            SearchUsersSort::Alpha => sort_by_profile_name(results),
        })
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::{
        Event, EventKey, ProfileUpdate, PublicKey, SerializedContent, SignedEvent,
        content::ContentBody,
    };

    fn make_result(identity: &str, sequence: u64, rank: f32, created_at: u64) -> SearchResult {
        let event = Event {
            key: Some(EventKey {
                collection: 2,
                identity: identity.to_string(),
                signed_by: Some(PublicKey {
                    key_type: 1,
                    key: vec![0xAA],
                }),
                sequence,
            }),
            created_at,
            ..Default::default()
        };
        SearchResult {
            event_bundle: Some(EventBundle {
                signed_event: Some(SignedEvent {
                    signature: Vec::new(),
                    event_bytes: event.encode_to_vec(),
                }),
                serialized_content: None,
                event_proofs: Vec::new(),
                meta: None,
            }),
            rank,
        }
    }

    fn with_profile_name(mut result: SearchResult, name: &str) -> SearchResult {
        let content = Content {
            content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
                name: Some(name.to_string()),
                ..Default::default()
            })),
        };
        result.event_bundle.as_mut().unwrap().serialized_content = Some(SerializedContent {
            content_bytes: content.encode_to_vec(),
        });
        result
    }

    #[test]
    fn dedupes_results_keeping_best_rank() {
        let mut results = vec![
            make_result("a", 1, 0.25, 10),
            make_result("a", 1, 0.75, 10),
            make_result("b", 1, 0.5, 10),
        ];
        merge_search_results(&mut results);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].rank, 0.75);
    }

    #[test]
    fn sorts_by_rank_descending() {
        let mut results = vec![
            make_result("a", 1, 0.1, 10),
            make_result("b", 1, 0.9, 10),
            make_result("c", 1, 0.5, 10),
        ];
        sort_by_rank(&mut results);
        let ranks: Vec<f32> = results.iter().map(|r| r.rank).collect();
        assert_eq!(ranks, vec![0.9, 0.5, 0.1]);
    }

    #[test]
    fn sorts_by_created_at_descending() {
        let mut results = vec![
            make_result("a", 1, 0.9, 10),
            make_result("b", 1, 0.1, 30),
            make_result("c", 1, 0.5, 20),
        ];
        sort_by_created_at(&mut results);
        let created: Vec<Option<u64>> = results.iter().map(result_created_at).collect();
        assert_eq!(created, vec![Some(30), Some(20), Some(10)]);
    }

    #[test]
    fn sorts_alphabetically_with_unnamed_last() {
        let mut results = vec![
            with_profile_name(make_result("a", 1, 0.9, 10), "Charlie"),
            make_result("d", 1, 0.8, 10),
            with_profile_name(make_result("b", 1, 0.1, 10), "alice"),
            with_profile_name(make_result("c", 1, 0.5, 10), "Bob"),
        ];
        sort_by_profile_name(&mut results);
        let names: Vec<Option<String>> = results.iter().map(result_profile_name).collect();
        assert_eq!(
            names,
            vec![
                Some("alice".to_string()),
                Some("bob".to_string()),
                Some("charlie".to_string()),
                None
            ]
        );
    }
}
