//! Feed-service RPCs surfaced as observables via `Query`.

use std::cmp::Reverse;
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use base64::prelude::*;
use polycentric_common::error::CoreError;
use polycentric_common::models::protos_v2::{
    Event, EventBundle, EventHint, GetExploreFeedRequest, GetFeedResponse, GetFollowingFeedRequest,
    GetIdentityFeedRequest, GetPostThreadRequest, GetPostThreadResponse, PageInfo, PageParams,
    feeds_service_client::FeedsServiceClient,
};
use prost::Message;
use serde::{Deserialize, Serialize};

use crate::{
    client::PolycentricClient,
    logging::log_warn,
    query::{
        QueryClient, QueryKey, QueryObservable, QueryOpts, channel,
        event::{
            key::EventKey,
            merge::{
                EventBundleResponse, merge_bundle_responses, merge_event_bundles, merge_event_hints,
            },
        },
        validation::{retain_validated_bundles, retain_validated_hints},
    },
};

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetIdentityFeedArgs {
    pub identity: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetFollowingFeedArgs {
    pub follower_identity: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetExploreFeedArgs {
    pub identity: Option<String>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetPostThreadArgs {
    pub event_key: EventKey,
    pub limit: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FakeCursorToken {
    /// Maps server url -> real cursor information
    pub map: BTreeMap<String, CursorInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CursorInfo {
    /// The opaque cursor token provided by the server.
    token: String,
    /// How many queries forward (positive) or backward (negative) we are from the original
    /// un-cursored query.
    offset: i32,
    /// has_next_page or has_previous_page, depending on `offset`'s value.
    more_data: bool,
}

/// Our responses to js-core need to contain data aggregated from multiple servers,
/// but "look like" a single server response.
/// Easy enough for lists of events, but the opaque tokens need to be faked as
/// an aggregate opaque token.
impl FakeCursorToken {
    pub fn encode(&self) -> Result<String, CoreError> {
        let bytes = serde_json::to_vec(self).map_err(|e| {
            CoreError::SerializationError(format!("Faking cursor token failed: {e}"))
        })?;

        let encoded = BASE64_STANDARD.encode(bytes);
        Ok(encoded)
    }

    pub fn decode(token: &str) -> Result<Self, CoreError> {
        let bytes = BASE64_STANDARD
            .decode(token)
            .map_err(|e| CoreError::DeserializationError(format!("Invalid fake cursor: {e}")))?;

        serde_json::from_slice(bytes.as_slice())
            .map_err(|e| CoreError::DeserializationError(format!("Invalid fake cursor: {e}")))
    }

    pub fn extend(&mut self, other: FakeCursorToken) {
        self.map.extend(other.map);
    }

    /// Create a fake cursor from a real one and some metadata.
    pub fn new(server: String, info: CursorInfo) -> Self {
        let mut fake = Self::default();
        fake.map.insert(server, info);
        fake
    }

    /// Create an encoded fake cursor from a real one and some metadata.
    pub fn encode_new(
        server: &str,
        token: &str,
        offset: i32,
        more_data: bool,
    ) -> Result<String, String> {
        FakeCursorToken::new(
            server.to_string(),
            CursorInfo {
                token: token.to_string(),
                offset,
                more_data,
            },
        )
        .encode()
        .map_err(|e| e.to_string())
    }

    /// Get the data needed for performing a remote query.
    /// Returns the token to send and the cursor's offset.
    pub fn extract(fake_token: &Option<String>, server: &str) -> (Option<String>, i32) {
        fake_token
            .as_ref()
            .and_then(|t| Self::decode(t).ok())
            .and_then(|mut fake| fake.map.remove(server))
            .map(|info| (Some(info.token), info.offset))
            .unwrap_or((None, 0))
    }
}

/// Empty map
impl Default for FakeCursorToken {
    fn default() -> Self {
        Self {
            map: BTreeMap::new(),
        }
    }
}

/// Replace server's cursor tokens with fake ones, so that they
/// can be merged with other server responses.
fn prepare_page_info(
    response: &mut GetFeedResponse,
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

/// Expects two encoded fake cursors as input.
/// Returns (encoded fake cursor, more_data).
/// Defaults to the first cursor and false if an error occurs.
fn merge_cursors(t1: String, t2: String) -> (String, bool) {
    let mut merged = FakeCursorToken::default();

    let Ok(c1) = FakeCursorToken::decode(&t1) else {
        log_warn(|| String::from("Unable to decode fake cursor!"));
        return (t1, false);
    };

    let Ok(mut c2) = FakeCursorToken::decode(&t2) else {
        log_warn(|| String::from("Unable to decode fake cursor!"));
        return (t1, false);
    };

    // Add any server cursors in c1, taking the latest when c2 also has a
    // cursor from this server.
    c1.map.into_iter().for_each(|(server, info)| {
        if let Some(other) = c2.map.remove(&server) {
            // If the offsets are opposite in sign, then a forward cursor is
            // being compared against a backward cursor.
            debug_assert!(
                (info.offset >= 0 && other.offset >= 0) || (info.offset <= 0 && other.offset <= 0)
            );

            let new_info = if info.offset.abs() >= other.offset.abs() {
                info
            } else {
                other
            };

            merged.map.insert(server, new_info);
        } else {
            merged.map.insert(server, info);
        }
    });

    // Add in any cursors in stil in c2
    merged.map.extend(c2.map);

    let more_data = merged.map.values().any(|info| info.more_data);

    (merged.encode().unwrap_or(t1), more_data)
}

pub fn merge_page_info(i1: Option<PageInfo>, i2: Option<PageInfo>) -> Option<PageInfo> {
    match (i1, i2) {
        (None, None) => None,
        (Some(i), None) => Some(i),
        (None, Some(i)) => Some(i),
        (Some(i1), Some(i2)) => {
            let (start_cursor, has_previous_page) = merge_cursors(i1.start_cursor, i2.start_cursor);
            let (end_cursor, has_next_page) = merge_cursors(i1.end_cursor, i2.end_cursor);

            Some(PageInfo {
                start_cursor,
                end_cursor,
                has_previous_page,
                has_next_page,
            })
        }
    }
}

/// Pull bundles out of each `EventHint` and copy them into the local
/// client stores. Hints are useful side-information the server
/// provides (e.g. the profile of a post's author).
fn copy_hints(client: &Arc<Mutex<PolycentricClient>>, hints: Vec<EventHint>) {
    let bundles: Vec<EventBundle> = hints.into_iter().filter_map(|h| h.event_bundle).collect();

    if !bundles.is_empty() {
        client.lock().unwrap().copy_bundles(bundles);
    }
}

/// Merge function for every feed-RPC observable
fn validated_feed_merge(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    do_feed_merge(values, client, true)
}

/// TODO: remove.
/// currently only used in tests.
#[allow(dead_code)]
fn merge_feed_responses(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    do_feed_merge(values, client, false)
}

fn do_feed_merge(
    values: &[Vec<u8>],
    client: &Arc<Mutex<PolycentricClient>>,
    validate: bool,
) -> Vec<u8> {
    let mut response = GetFeedResponse::default();
    for v in values {
        if let Ok(incoming) = GetFeedResponse::decode(v.as_slice()) {
            response.event_bundles.extend(incoming.event_bundles);
            response.event_hints.extend(incoming.event_hints);
            response.page_info = merge_page_info(response.page_info, incoming.page_info);
        }
    }

    merge_event_bundles(&mut response.event_bundles);
    merge_event_hints(&mut response.event_hints);

    if validate {
        let c = client.lock().unwrap();
        retain_validated_bundles(&c, &mut response.event_bundles);
        retain_validated_hints(&c, &mut response.event_hints);
    }

    // Ensure the merged events are sorted in feed order
    response.event_bundles.sort_by_cached_key(|bundle| {
        let created_at = bundle
            .signed_event
            .as_ref()
            // Events we cannot decode will be mapped to `None` and sorted at the end.
            .and_then(|se| Event::decode(se.event_bytes.as_slice()).ok())
            .map(|event| event.created_at);

        Reverse(created_at)
    });

    response.encode_to_vec()
}

/// Thread responses follow the shape of events + hints, except the events
/// are stored in `self.thread`.
impl EventBundleResponse for GetPostThreadResponse {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle> {
        &mut self.thread
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

/// Return posts for an identity.
pub fn get_identity_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetIdentityFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetIdentityFeedArgs {
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
            let mut response = FeedsServiceClient::new(channel(&server_url)?)
                .get_identity_feed(GetIdentityFeedRequest {
                    identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels: vec![],
                })
                .await
                .map_err(|e| format!("get_identity_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(&mut response, &server_url, backward_offset, forward_offset)?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Returns posts an identity is following
pub fn get_following_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetFollowingFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetFollowingFeedArgs {
        follower_identity,
        limit,
        backward_token,
        forward_token,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let follower_identity = follower_identity.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = FeedsServiceClient::new(channel(&server_url)?)
                .get_following_feed(GetFollowingFeedRequest {
                    follower_identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels: vec![],
                })
                .await
                .map_err(|e| format!("get_following_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(&mut response, &server_url, backward_offset, forward_offset)?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Server-curated explore feed of posts relevant to `identity`.
pub fn get_explore_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetExploreFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetExploreFeedArgs {
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
            let mut response = FeedsServiceClient::new(channel(&server_url)?)
                .get_explore_feed(GetExploreFeedRequest {
                    identity: identity.clone(),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels: vec![],
                })
                .await
                .map_err(|e| format!("get_explore_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(&mut response, &server_url, backward_offset, forward_offset)?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Fetch a parent post and its direct replies. `event_key` identifies
/// the parent post. Fans out to every configured server and emits the
/// merged `GetPostThreadResponse` progressively; each response's
/// `event_hints` are persisted to the local store so author profiles
/// don't need to be re-fetched later.
pub fn get_post_thread(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetPostThreadArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetPostThreadArgs { event_key, limit } = args;
    let request = GetPostThreadRequest {
        event_key: Some(event_key.into()),
        limit,
    };

    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = FeedsServiceClient::new(channel(&server_url)?)
                .get_post_thread(request)
                .await
                .map_err(|e| format!("get_post_thread [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            copy_hints(&client, response.event_hints);
            client.lock().unwrap().copy_bundles(response.thread);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_bundle_responses::<GetPostThreadResponse>,
        opts,
    ))
}

#[cfg(test)]
mod tests {
    use crate::query::event::merge::event_dedup_key;

    use super::*;
    use polycentric_common::models::protos_v2::{
        Event, EventBundle, EventHint, EventKey, GetFeedResponse, PublicKey, SignedEvent,
    };

    fn make_bundle(
        collection: i32,
        identity: &str,
        key_type: i32,
        key: Vec<u8>,
        sequence: u64,
    ) -> EventBundle {
        let event = Event {
            key: Some(EventKey {
                collection,
                identity: identity.to_string(),
                signed_by: Some(PublicKey { key_type, key }),
                sequence,
            }),
            ..Default::default()
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: None,
            event_proofs: Vec::new(),
            meta: None,
        }
    }

    fn test_client() -> Arc<Mutex<PolycentricClient>> {
        Arc::new(Mutex::new(PolycentricClient::new()))
    }

    fn encode_response(bundles: Vec<EventBundle>, hints: Vec<EventBundle>) -> Vec<u8> {
        GetFeedResponse {
            event_bundles: bundles,
            event_hints: hints
                .into_iter()
                .map(|b| EventHint {
                    event_bundle: Some(b),
                })
                .collect(),
            page_info: None,
        }
        .encode_to_vec()
    }

    #[test]
    fn event_dedup_key_extracts_tuple() {
        let bundle = make_bundle(2, "id-a", 1, vec![0xAA], 5);
        let key = event_dedup_key(&bundle).expect("key");
        assert_eq!(key, (2, "id-a".to_string(), 1, vec![0xAA], 5));
    }

    #[test]
    fn event_dedup_key_returns_none_for_missing_signed_event() {
        let bundle = EventBundle {
            signed_event: None,
            serialized_content: None,
            event_proofs: Vec::new(),
            meta: None,
        };
        assert!(event_dedup_key(&bundle).is_none());
    }

    #[test]
    fn event_dedup_key_returns_none_for_invalid_event_bytes() {
        let bundle = EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: vec![0xFF, 0xFF, 0xFF],
            }),
            serialized_content: None,
            event_proofs: Vec::new(),
            meta: None,
        };
        assert!(event_dedup_key(&bundle).is_none());
    }

    #[test]
    fn merge_concatenates_when_no_overlap() {
        let prev = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let new = encode_response(vec![make_bundle(2, "b", 1, vec![2], 1)], vec![]);

        let merged = merge_feed_responses(&[prev, new], &test_client());
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 2);
    }

    #[test]
    fn merge_dedupes_event_bundles_by_event_key() {
        let dup = make_bundle(2, "a", 1, vec![1], 1);
        let prev = encode_response(vec![dup.clone()], vec![]);
        let new = encode_response(
            vec![dup.clone(), make_bundle(2, "a", 1, vec![1], 2)],
            vec![],
        );

        let merged = merge_feed_responses(&[prev, new], &test_client());
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 2);
        let seqs: Vec<u64> = decoded
            .event_bundles
            .iter()
            .filter_map(|b| event_dedup_key(b).map(|k| k.4))
            .collect();
        assert_eq!(seqs, vec![1, 2]);
    }

    #[test]
    fn merge_dedupes_hints_by_event_key() {
        let dup = make_bundle(2, "a", 1, vec![9], 7);
        let prev = encode_response(vec![], vec![dup.clone()]);
        let new = encode_response(vec![], vec![dup.clone()]);

        let merged = merge_feed_responses(&[prev, new], &test_client());
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_hints.len(), 1);
    }

    #[test]
    fn merge_handles_no_prior_value() {
        let new = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let merged = merge_feed_responses(&[new], &test_client());
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 1);
    }

    #[test]
    fn merge_retains_unparseable_bundles_without_dedup() {
        let parseable = make_bundle(2, "a", 1, vec![1], 1);
        let unparseable = EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: vec![0xFF, 0xFF, 0xFF],
            }),
            serialized_content: None,
            event_proofs: Vec::new(),
            meta: None,
        };
        let new = encode_response(vec![parseable, unparseable.clone(), unparseable], vec![]);
        let merged = merge_feed_responses(&[new], &test_client());
        // Parseable + both unparseables retained (no dedup key to compare).
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 3);
    }
}

#[cfg(test)]
mod cursor_tests {
    use super::*;

    #[test]
    fn fake_cursor_roundtrip_extracts_per_server() {
        let token = FakeCursorToken::encode_new("server-a", "real-token", 1, true).unwrap();

        let (extracted, offset) = FakeCursorToken::extract(&Some(token.clone()), "server-a");
        assert_eq!(extracted.as_deref(), Some("real-token"));
        assert_eq!(offset, 1);

        // A server not present in the aggregate starts from scratch.
        let (extracted, offset) = FakeCursorToken::extract(&Some(token), "server-b");
        assert_eq!(extracted, None);
        assert_eq!(offset, 0);
    }

    #[test]
    fn extract_without_a_token_is_empty() {
        let (extracted, offset) = FakeCursorToken::extract(&None, "server-a");
        assert_eq!(extracted, None);
        assert_eq!(offset, 0);
    }

    fn faked_page_info(server: &str, has_next_page: bool) -> PageInfo {
        PageInfo {
            start_cursor: FakeCursorToken::encode_new(server, "start", -1, false).unwrap(),
            end_cursor: FakeCursorToken::encode_new(server, "end", 1, has_next_page).unwrap(),
            has_previous_page: false,
            has_next_page,
        }
    }

    #[test]
    fn merged_page_info_combines_servers() {
        let merged = merge_page_info(
            Some(faked_page_info("server-a", true)),
            Some(faked_page_info("server-b", false)),
        )
        .unwrap();

        // Any server with more data leaves the merged page open.
        assert!(merged.has_next_page);

        // Both servers' real cursors survive inside the aggregate.
        let (token_a, _) = FakeCursorToken::extract(&Some(merged.end_cursor.clone()), "server-a");
        let (token_b, _) = FakeCursorToken::extract(&Some(merged.end_cursor), "server-b");
        assert_eq!(token_a.as_deref(), Some("end"));
        assert_eq!(token_b.as_deref(), Some("end"));
    }

    #[test]
    fn merged_page_info_keeps_the_farthest_cursor_per_server() {
        let near = PageInfo {
            start_cursor: FakeCursorToken::encode_new("s", "start-1", -1, false).unwrap(),
            end_cursor: FakeCursorToken::encode_new("s", "end-1", 1, true).unwrap(),
            has_previous_page: false,
            has_next_page: true,
        };
        let far = PageInfo {
            start_cursor: FakeCursorToken::encode_new("s", "start-2", -2, false).unwrap(),
            end_cursor: FakeCursorToken::encode_new("s", "end-2", 2, false).unwrap(),
            has_previous_page: false,
            has_next_page: false,
        };

        let merged = merge_page_info(Some(near), Some(far)).unwrap();
        let (token, offset) = FakeCursorToken::extract(&Some(merged.end_cursor), "s");
        assert_eq!(token.as_deref(), Some("end-2"));
        assert_eq!(offset, 2);
    }
}
