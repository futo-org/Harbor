//! Observable query wrappers over the moderation read-endpoints of
//! `IdentityService`: `IsModerator`, `IsBanned`, and `ListBans`. All are
//! network-only (nothing is cached in the local event store) and
//! authenticated by the bearer JWT the transport attaches.
//!
//! `is_moderator` and `is_banned` fan out across the configured servers
//! and emit a **server-URL -> bool** map: each server answers with the
//! scalar `Is*Response`, the per-server `query_fn` tags that answer with
//! its own URL as a one-entry JSON object, and the `merge_fn` unions
//! those into the full map. The map is an SDK-internal aggregate, so it
//! is JSON (not a proto): it never crosses an RPC boundary.
//!
//! `list_bans` is per-server and paginated, so there is nothing to
//! aggregate — callers pin a single server via `QueryOpts::servers` (and
//! scope the `QueryKey` by that server) and it passes the server's
//! `ListBansResponse` straight through.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    IsBannedRequest, IsModeratorRequest, ListBansRequest, ListBansResponse,
    identity_service_client::IdentityServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct IsModeratorArgs {}

#[derive(Clone, Debug, uniffi::Record)]
pub struct IsBannedArgs {
    pub target_identity: String,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListBansArgs {
    pub limit: Option<u32>,
    pub after: Option<String>,
    pub query: Option<String>,
}

/// Union every server's one-entry `{server_url: bool}` JSON object into a
/// single `{server_url: bool}` map, re-encoded as JSON.
fn merge_status_by_server(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    _client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut by_server: BTreeMap<String, bool> = BTreeMap::new();
    for v in values {
        if let Ok(entry) = serde_json::from_slice::<BTreeMap<String, bool>>(v) {
            by_server.extend(entry);
        }
    }
    serde_json::to_vec(&by_server).unwrap_or_default()
}

/// Union of the banned identities (first occurrence wins), keeping the
/// first responding server's `page_info`. Pagination only makes sense
/// against a single (pinned) server, which is how this query is meant to
/// be called; the union is just a well-defined fallback.
fn merge_list_bans(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    _client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = ListBansResponse::default();
    let mut seen = std::collections::HashSet::new();
    for v in values {
        if let Ok(response) = ListBansResponse::decode(v.as_slice()) {
            for identity in response.banned_identities {
                if seen.insert(identity.clone()) {
                    merged.banned_identities.push(identity);
                }
            }
            if merged.page_info.is_none() {
                merged.page_info = response.page_info;
            }
        }
    }
    merged.encode_to_vec()
}

/// For each configured server, whether the authenticated caller is a
/// moderator there. Emits a JSON `{server_url: bool}` map.
pub fn is_moderator(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    _args: IsModeratorArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let query_fn = move |server_url: String| async move {
        let is_moderator = IdentityServiceClient::new(channel(&server_url).await?)
            .is_moderator(IsModeratorRequest {})
            .await
            .map_err(|e| format!("is_moderator [{server_url}]: {e}"))?
            .into_inner()
            .is_moderator;
        let entry = BTreeMap::from([(server_url, is_moderator)]);
        serde_json::to_vec(&entry).map_err(|e| format!("is_moderator encode: {e}"))
    };
    Arc::new(query_client.fetch(query_key, query_fn, merge_status_by_server, opts))
}

/// For each configured server, whether `target_identity` is banned there.
/// Emits a JSON `{server_url: bool}` map.
pub fn is_banned(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: IsBannedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let IsBannedArgs { target_identity } = args;
    let query_fn = move |server_url: String| {
        let target_identity = target_identity.clone();
        async move {
            let is_banned = IdentityServiceClient::new(channel(&server_url).await?)
                .is_banned(IsBannedRequest { target_identity })
                .await
                .map_err(|e| format!("is_banned [{server_url}]: {e}"))?
                .into_inner()
                .is_banned;
            let entry = BTreeMap::from([(server_url, is_banned)]);
            serde_json::to_vec(&entry).map_err(|e| format!("is_banned encode: {e}"))
        }
    };
    Arc::new(query_client.fetch(query_key, query_fn, merge_status_by_server, opts))
}

/// A page of banned identities from a single (pinned) server. Emits
/// serialized `ListBansResponse` bytes.
pub fn list_bans(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListBansArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListBansArgs {
        limit,
        after,
        query,
    } = args;
    let query_fn = move |server_url: String| {
        let after = after.clone();
        let query = query.clone();
        async move {
            let response = IdentityServiceClient::new(channel(&server_url).await?)
                .list_bans(ListBansRequest {
                    limit,
                    after,
                    query,
                })
                .await
                .map_err(|e| format!("list_bans [{server_url}]: {e}"))?
                .into_inner();
            Ok(response.encode_to_vec())
        }
    };
    Arc::new(query_client.fetch(query_key, query_fn, merge_list_bans, opts))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> Arc<Mutex<PolycentricClient>> {
        Arc::new(Mutex::new(PolycentricClient::new()))
    }

    fn status_entry(server: &str, value: bool) -> Vec<u8> {
        serde_json::to_vec(&BTreeMap::from([(server.to_string(), value)])).unwrap()
    }

    fn list_bans_bytes(identities: &[&str]) -> Vec<u8> {
        ListBansResponse {
            banned_identities: identities.iter().map(|s| s.to_string()).collect(),
            page_info: None,
        }
        .encode_to_vec()
    }

    #[test]
    fn merge_status_unions_per_server_entries() {
        let merged = merge_status_by_server(
            &[
                status_entry("https://a", true),
                status_entry("https://b", false),
            ],
            None,
            &client(),
        );
        let decoded: BTreeMap<String, bool> = serde_json::from_slice(&merged).unwrap();
        assert_eq!(decoded.get("https://a"), Some(&true));
        assert_eq!(decoded.get("https://b"), Some(&false));
    }

    #[test]
    fn merge_status_ignores_undecodable_entries() {
        let merged = merge_status_by_server(
            &[vec![0xff], status_entry("https://a", true)],
            None,
            &client(),
        );
        let decoded: BTreeMap<String, bool> = serde_json::from_slice(&merged).unwrap();
        assert_eq!(decoded.len(), 1);
        assert_eq!(decoded.get("https://a"), Some(&true));
    }

    #[test]
    fn merge_list_bans_unions_and_dedupes_identities() {
        let merged = merge_list_bans(
            &[list_bans_bytes(&["a", "b"]), list_bans_bytes(&["b", "c"])],
            None,
            &client(),
        );
        let decoded = ListBansResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.banned_identities, vec!["a", "b", "c"]);
    }
}
