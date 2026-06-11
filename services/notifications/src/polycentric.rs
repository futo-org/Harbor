//! Read-only client for fetching identity data from polycentric servers
//! over gRPC. The notifications service only consumes events (it never
//! publishes), so unlike the moderation service's client this holds no
//! signing key or chain state — just the set of servers to query and the
//! one-shot read methods built on `EventSyncService.ListEvents`.

use log::warn;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, Event, ListEventsFilters, ListEventsRequest, PublicKey, content::ContentBody,
    event_sync_service_client::EventSyncServiceClient,
};
use polycentric_core::query::channel;
use prost::Message;

/// Client for querying polycentric servers for identity/profile data.
pub struct PolycentricClient {
    /// gRPC server URLs to query.
    servers: Vec<String>,
}

impl PolycentricClient {
    /// Build a client that queries the given gRPC server URLs.
    pub fn new(servers: Vec<String>) -> Self {
        Self { servers }
    }

    /// Build from `POLYCENTRIC_QUERY_SERVERS` — a comma-separated
    /// list of gRPC server URLs.
    pub fn from_env() -> Result<Self, String> {
        let servers: Vec<String> = std::env::var("POLYCENTRIC_QUERY_SERVERS")
            .map_err(|_| "POLYCENTRIC_QUERY_SERVERS is not set".to_string())?
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if servers.is_empty() {
            return Err("POLYCENTRIC_QUERY_SERVERS is empty".to_string());
        }

        Ok(Self::new(servers))
    }

    /// Best-effort display name for `identity`, decoded from its latest
    /// PROFILE event's `ProfileUpdate.name`. Queries each configured
    /// server in turn and returns the first name found; `None` when no
    /// server has a profile name (callers fall back to a generic label).
    pub async fn display_name(&self, identity: &str) -> Option<String> {
        for server in &self.servers {
            match self
                .latest_content(server, collections::PROFILE, identity)
                .await
            {
                Ok(Some(content)) => {
                    if let Some(ContentBody::ProfileUpdate(profile)) = content.content_body {
                        if let Some(name) = profile.name.filter(|s| !s.is_empty()) {
                            return Some(name);
                        }
                    }
                }
                Ok(None) => continue,
                Err(e) => warn!("display_name [{server}]: {e}"),
            }
        }
        None
    }

    /// The authorized signing keys for `identity`, taken from the
    /// `signing_keys` and `rotation_keys` of its latest IDENTITY event. Queries each server in
    /// turn and returns the first non-empty set; an empty vec when none is
    /// found (the caller then has no keys to resolve tokens for).
    pub async fn authorized_keys(&self, identity: &str) -> Vec<PublicKey> {
        // TODO filter out revoked keys

        for server in &self.servers {
            match self
                .latest_content(server, collections::IDENTITY, identity)
                .await
            {
                Ok(Some(content)) => {
                    if let Some(ContentBody::Identity(id)) = content.content_body {
                        let all_keys = [id.signing_keys, id.rotation_keys].concat();
                        if !all_keys.is_empty() {
                            return all_keys;
                        }
                    }
                }
                Ok(None) => continue,
                Err(e) => warn!("authorized_keys [{server}]: {e}"),
            }
        }
        Vec::new()
    }

    /// Fetch the content of the highest-sequence event in `collection` for
    /// `identity` from a single server.
    async fn latest_content(
        &self,
        server: &str,
        collection: i32,
        identity: &str,
    ) -> Result<Option<Content>, String> {
        let mut client = EventSyncServiceClient::new(channel(server)?);
        let response = client
            .list_events(ListEventsRequest {
                filters: Some(ListEventsFilters {
                    collection: Some(collection),
                    identity: Some(identity.to_string()),
                    ..Default::default()
                }),
                size: None,
            })
            .await
            .map_err(|e| format!("list_events: {e}"))?
            .into_inner();

        // Of the returned events, the canonically-current one is the
        // highest-sequence event; decode and keep its content.
        let mut best: Option<(u64, Content)> = None;
        for bundle in response.event_bundles {
            let Some(signed) = bundle.signed_event.as_ref() else {
                continue;
            };
            let Ok(event) = Event::decode(signed.event_bytes.as_slice()) else {
                continue;
            };
            let sequence = event.key.as_ref().map_or(0, |k| k.sequence);

            let Some(serialized) = bundle.serialized_content.as_ref() else {
                continue;
            };
            let Ok(content) = Content::decode(serialized.content_bytes.as_slice()) else {
                continue;
            };

            if best.as_ref().is_none_or(|(seq, _)| sequence >= *seq) {
                best = Some((sequence, content));
            }
        }

        Ok(best.map(|(_, content)| content))
    }
}
