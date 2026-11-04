//! An in-process gRPC server holding events in memory, for SDK tests.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::event_sync_service_server::{
    EventSyncService, EventSyncServiceServer,
};
use polycentric_common::models::protos_v2::server_service_server::{
    ServerService, ServerServiceServer,
};
use polycentric_common::models::protos_v2::{
    Event, EventBundle, EventKey, GetAttributedToReactionCountsRequest,
    GetAttributedToReactionCountsResponse, GetReactionsRequest, GetReactionsResponse,
    GetServerInfoRequest, GetServerInfoResponse, ListEventsRequest, ListEventsResponse,
    ListHeadsRequest, ListHeadsResponse, PutEventsRequest, PutEventsResponse, ServerInfo,
    SubscribeHeadsRequest,
};
use prost::Message;
use tonic::{Request, Response, Status};

type Key = (String, Vec<u8>, i32, u64);

#[derive(Default, Clone)]
pub struct MockServer {
    events: Arc<Mutex<BTreeMap<Key, EventBundle>>>,
}

fn key_of(bundle: &EventBundle) -> Option<(Key, EventKey)> {
    let event = Event::decode(bundle.signed_event.as_ref()?.event_bytes.as_slice()).ok()?;
    let key = event.key?;
    let signer = key.signed_by.as_ref()?.encode_to_vec();
    Some((
        (key.identity.clone(), signer, key.collection, key.sequence),
        key,
    ))
}

impl MockServer {
    /// Serve on a random local port; returns the server URL.
    pub async fn start() -> (Self, String) {
        let server = MockServer::default();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let svc = server.clone();
        tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(EventSyncServiceServer::new(svc.clone()))
                .add_service(ServerServiceServer::new(svc))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (server, format!("http://{addr}"))
    }

    pub fn event_count(&self, identity: &str) -> usize {
        self.events
            .lock()
            .unwrap()
            .keys()
            .filter(|k| k.0 == identity)
            .count()
    }
}

#[tonic::async_trait]
impl EventSyncService for MockServer {
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsResponse>, Status> {
        let filters = request.into_inner().filters.unwrap_or_default();
        let events = self.events.lock().unwrap();
        let event_bundles = events
            .iter()
            .filter(|(k, _)| k.0 == filters.identity)
            .filter(|(k, _)| filters.collection.is_none_or(|c| c == k.2))
            .filter(|(k, _)| {
                !filters.heads.iter().any(|h| {
                    h.collection == k.2
                        && h.signed_by.as_ref().map(|s| s.encode_to_vec()) == Some(k.1.clone())
                        && k.3 <= h.sequence
                })
            })
            .map(|(_, b)| b.clone())
            .collect();
        Ok(Response::new(ListEventsResponse {
            event_bundles,
            event_hints: vec![],
        }))
    }

    async fn put_events(
        &self,
        request: Request<PutEventsRequest>,
    ) -> Result<Response<PutEventsResponse>, Status> {
        let mut events = self.events.lock().unwrap();
        for bundle in request.into_inner().event_bundles {
            if let Some((key, _)) = key_of(&bundle) {
                events.entry(key).or_insert(EventBundle {
                    event_proofs: vec![],
                    meta: None,
                    ..bundle
                });
            }
        }
        Ok(Response::new(PutEventsResponse::default()))
    }

    async fn list_heads(
        &self,
        request: Request<ListHeadsRequest>,
    ) -> Result<Response<ListHeadsResponse>, Status> {
        let identity = request.into_inner().identity;
        let events = self.events.lock().unwrap();
        let mut heads: BTreeMap<(Vec<u8>, i32), EventKey> = BTreeMap::new();
        for (k, b) in events.iter().filter(|(k, _)| k.0 == identity) {
            let (_, key) = key_of(b).unwrap();
            let entry = heads.entry((k.1.clone(), k.2)).or_insert(key.clone());
            if key.sequence > entry.sequence {
                *entry = key;
            }
        }
        Ok(Response::new(ListHeadsResponse {
            heads: heads.into_values().collect(),
        }))
    }

    type SubscribeHeadsStream =
        tokio_stream::Iter<std::vec::IntoIter<Result<ListHeadsResponse, Status>>>;

    async fn subscribe_heads(
        &self,
        _request: Request<SubscribeHeadsRequest>,
    ) -> Result<Response<Self::SubscribeHeadsStream>, Status> {
        Err(Status::unimplemented("subscribe_heads"))
    }

    async fn get_reactions(
        &self,
        _request: Request<GetReactionsRequest>,
    ) -> Result<Response<GetReactionsResponse>, Status> {
        Err(Status::unimplemented("get_reactions"))
    }

    async fn get_attributed_to_reaction_counts(
        &self,
        _request: Request<GetAttributedToReactionCountsRequest>,
    ) -> Result<Response<GetAttributedToReactionCountsResponse>, Status> {
        Err(Status::unimplemented("get_attributed_to_reaction_counts"))
    }
}

#[tonic::async_trait]
impl ServerService for MockServer {
    async fn get_info(
        &self,
        _request: Request<GetServerInfoRequest>,
    ) -> Result<Response<GetServerInfoResponse>, Status> {
        Ok(Response::new(GetServerInfoResponse {
            server_info: Some(ServerInfo::default()),
        }))
    }
}
