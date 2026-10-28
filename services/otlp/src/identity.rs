//! Identity documents, fetched from polycentric servers and cached.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, Identity, ListEventsFilters, ListEventsRequest, PublicKey,
    content::ContentBody, event_sync_service_client::EventSyncServiceClient,
};
use polycentric_core::query::channel;
use prost::Message;
use tracing::warn;

const CACHE_TTL: Duration = Duration::from_secs(5 * 60);

/// Whether `signer` may act for `identity`.
#[tonic::async_trait]
pub trait Identities: Send + Sync {
    async fn authorizes(&self, identity: &str, signer: &PublicKey) -> Result<bool, String>;
}

pub struct PolycentricIdentities {
    servers: Vec<String>,
    cache: Mutex<HashMap<String, (Instant, Identity)>>,
}

impl PolycentricIdentities {
    pub fn new(servers: Vec<String>) -> Self {
        Self {
            servers,
            cache: Mutex::new(HashMap::new()),
        }
    }

    async fn identity(&self, identity: &str) -> Result<Option<Identity>, String> {
        if let Some((fetched, document)) = self
            .cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(identity)
            && fetched.elapsed() < CACHE_TTL
        {
            return Ok(Some(document.clone()));
        }

        let mut last_error = None;
        for server in &self.servers {
            match latest_content(server, collections::IDENTITY, identity).await {
                Ok(Some(Content {
                    content_body: Some(ContentBody::Identity(document)),
                })) => {
                    self.cache
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .insert(identity.to_string(), (Instant::now(), document.clone()));
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
}

#[tonic::async_trait]
impl Identities for PolycentricIdentities {
    async fn authorizes(&self, identity: &str, signer: &PublicKey) -> Result<bool, String> {
        Ok(self
            .identity(identity)
            .await?
            .is_some_and(|document| document.authorizes_signer(signer)))
    }
}

/// The content of the highest-sequence event in `collection` for `identity`.
async fn latest_content(
    server: &str,
    collection: i32,
    identity: &str,
) -> Result<Option<Content>, String> {
    let mut client = EventSyncServiceClient::new(channel(server).await?);
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
    Ok(best_content(response.event_bundles))
}

/// The content of the highest-sequence decodable bundle.
pub fn best_content(bundles: Vec<EventBundle>) -> Option<Content> {
    let mut best: Option<(u64, Content)> = None;
    for bundle in bundles {
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
    best.map(|(_, content)| content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::{EventKey, SerializedContent, SignedEvent};

    fn bundle(sequence: u64, marker: u8) -> EventBundle {
        let event = Event {
            key: Some(EventKey {
                sequence,
                ..Default::default()
            }),
            ..Default::default()
        };
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
            signed_event: Some(SignedEvent {
                event_bytes: event.encode_to_vec(),
                ..Default::default()
            }),
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
    fn picks_the_highest_sequence() {
        let best = best_content(vec![bundle(3, 3), bundle(7, 7), bundle(5, 5)]);
        assert_eq!(marker_of(best), Some(7));
    }

    #[test]
    fn skips_bundles_that_do_not_decode() {
        let mut broken = bundle(9, 9);
        broken.serialized_content.as_mut().unwrap().content_bytes = vec![0xff, 0xff];
        let mut eventless = bundle(8, 8);
        eventless.signed_event = None;
        let best = best_content(vec![broken, eventless, bundle(2, 2)]);
        assert_eq!(marker_of(best), Some(2));
    }

    #[test]
    fn no_bundles_means_no_content() {
        assert!(best_content(vec![]).is_none());
    }
}
