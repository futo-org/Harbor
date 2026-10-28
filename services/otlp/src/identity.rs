//! Identity documents, fetched from polycentric servers and cached.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, EventBundle, Identity, ListEventsFilters, ListEventsRequest, PublicKey,
    content::ContentBody, event_sync_service_client::EventSyncServiceClient,
};
use polycentric_core::query::channel;
use polycentric_core::query::transport::GrpcChannel;
use prost::Message;
use tracing::warn;

const CACHE_TTL: Duration = Duration::from_secs(5 * 60);

type Client = EventSyncServiceClient<GrpcChannel>;

pub struct PolycentricIdentities {
    clients: Vec<(String, Client)>,
    cache: Mutex<HashMap<String, (Instant, Identity)>>,
}

impl PolycentricIdentities {
    /// Channels connect lazily, so this only fails on a malformed URL.
    pub async fn connect(servers: Vec<String>) -> Result<Self, String> {
        let mut clients = Vec::with_capacity(servers.len());
        for server in servers {
            let client = EventSyncServiceClient::new(channel(&server).await?);
            clients.push((server, client));
        }
        Ok(Self {
            clients,
            cache: Mutex::new(HashMap::new()),
        })
    }

    /// Whether `signer` may act for `identity`.
    pub async fn authorizes(&self, identity: &str, signer: &PublicKey) -> Result<bool, String> {
        Ok(self
            .identity(identity)
            .await?
            .is_some_and(|document| document.authorizes_signer(signer)))
    }

    async fn identity(&self, identity: &str) -> Result<Option<Identity>, String> {
        if let Some(document) = self.cached(identity) {
            return Ok(Some(document));
        }

        let mut last_error = None;
        for (server, client) in &self.clients {
            match latest_content(client.clone(), collections::IDENTITY, identity).await {
                Ok(Some(Content {
                    content_body: Some(ContentBody::Identity(document)),
                })) => {
                    let entry = (Instant::now(), document.clone());
                    self.lock().insert(identity.to_string(), entry);
                    return Ok(Some(document));
                }
                Ok(_) => continue,
                Err(e) => {
                    warn!(server, error = %e, "identity lookup failed");
                    last_error = Some(e);
                }
            }
        }
        match last_error {
            Some(e) => Err(e),
            None => Ok(None),
        }
    }

    fn cached(&self, identity: &str) -> Option<Identity> {
        let cache = self.lock();
        let (fetched, document) = cache.get(identity)?;
        (fetched.elapsed() < CACHE_TTL).then(|| document.clone())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, (Instant, Identity)>> {
        self.cache.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// The content of the latest event in `collection` for `identity`.
async fn latest_content(
    mut client: Client,
    collection: i32,
    identity: &str,
) -> Result<Option<Content>, String> {
    let response = client
        .list_events(ListEventsRequest {
            filters: Some(ListEventsFilters {
                collection: Some(collection),
                identity: identity.to_string(),
                ..Default::default()
            }),
            size: None,
        })
        .await
        .map_err(|e| format!("list_events: {e}"))?
        .into_inner();
    Ok(first_content(response.event_bundles))
}

/// `ListEvents` returns bundles newest first, so the first one that decodes
/// is the current document.
pub fn first_content(bundles: Vec<EventBundle>) -> Option<Content> {
    bundles.into_iter().find_map(|bundle| {
        let serialized = bundle.serialized_content?;
        Content::decode(serialized.content_bytes.as_slice()).ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::SerializedContent;

    fn bundle(marker: u8) -> EventBundle {
        let content = Content {
            content_body: Some(ContentBody::Identity(Identity {
                signing_keys: vec![PublicKey {
                    key_type: 1,
                    key: vec![marker],
                }],
                ..Default::default()
            })),
        };
        EventBundle {
            serialized_content: Some(SerializedContent {
                content_bytes: content.encode_to_vec(),
            }),
            ..Default::default()
        }
    }

    fn marker_of(content: Option<Content>) -> Option<u8> {
        match content?.content_body? {
            ContentBody::Identity(identity) => identity.signing_keys.first()?.key.first().copied(),
            _ => None,
        }
    }

    #[test]
    fn takes_the_first_bundle() {
        assert_eq!(
            marker_of(first_content(vec![bundle(7), bundle(3)])),
            Some(7)
        );
    }

    #[test]
    fn skips_bundles_that_do_not_decode() {
        let mut broken = bundle(9);
        broken.serialized_content.as_mut().unwrap().content_bytes = vec![0xff, 0xff];
        let mut empty = bundle(8);
        empty.serialized_content = None;
        assert_eq!(
            marker_of(first_content(vec![broken, empty, bundle(2)])),
            Some(2)
        );
    }

    #[test]
    fn no_bundles_means_no_content() {
        assert!(first_content(vec![]).is_none());
    }
}
