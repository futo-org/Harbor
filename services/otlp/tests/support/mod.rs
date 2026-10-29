//! A polycentric server stand-in speaking real gRPC, plus the otlp service
//! on a real socket, so tests cover the code paths production runs.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signer, SigningKey};
use otlp_service::config::{Config, Zulip};
use otlp_service::identity::PolycentricIdentities;
use otlp_service::routes::{AppState, build_routes};
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    Content, EventBundle, GetAttributedToReactionCountsRequest,
    GetAttributedToReactionCountsResponse, GetReactionsRequest, GetReactionsResponse, Identity,
    KeyType, ListEventsRequest, ListEventsResponse, ListHeadsRequest, ListHeadsResponse, PublicKey,
    PutEventsRequest, PutEventsResponse, SerializedContent, SubscribeHeadsRequest,
    content::ContentBody,
    event_sync_service_server::{EventSyncService, EventSyncServiceServer},
};
use prost::Message;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::{Request, Response, Status};

/// A device key the identity documents below authorize.
pub fn device_key() -> SigningKey {
    SigningKey::from_bytes(&[42u8; 32])
}

pub fn public_key(key: &SigningKey) -> PublicKey {
    PublicKey {
        key_type: KeyType::Ed25519 as i32,
        key: key.verifying_key().to_bytes().to_vec(),
    }
}

/// An identity document whose only key is `key`; its identity key is derived
/// from the content exactly as clients do.
pub fn identity_for(key: &SigningKey) -> (String, Identity) {
    let identity = Identity {
        rotation_keys: vec![public_key(key)],
        ..Default::default()
    };
    (identity.derive_hex_key(), identity)
}

/// Serves `ListEvents` for the IDENTITY collection from a fixed set of
/// documents, as a polycentric server would.
#[derive(Clone, Default)]
pub struct PolycentricStandIn {
    documents: HashMap<String, Identity>,
    down: Arc<AtomicBool>,
}

/// Switches the stand-in it came from between answering and failing.
pub struct Outage(Arc<AtomicBool>);

impl Outage {
    pub fn begin(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

impl PolycentricStandIn {
    pub fn with(mut self, key: &SigningKey) -> Self {
        let (identity_key, document) = identity_for(key);
        self.documents.insert(identity_key, document);
        self
    }

    /// Spawn on an ephemeral port and return the URL to query it at, plus a
    /// switch that makes it fail every request.
    pub async fn serve(self) -> (String, Outage) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let outage = Outage(self.down.clone());
        tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(EventSyncServiceServer::new(self))
                .serve_with_incoming(TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (url, outage)
    }
}

#[tonic::async_trait]
impl EventSyncService for PolycentricStandIn {
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsResponse>, Status> {
        if self.down.load(Ordering::SeqCst) {
            return Err(Status::unavailable("stand-in is down"));
        }
        let filters = request.into_inner().filters.unwrap_or_default();
        let event_bundles = match (filters.collection, self.documents.get(&filters.identity)) {
            (Some(c), Some(document)) if c == collections::IDENTITY => {
                let content = Content {
                    content_body: Some(ContentBody::Identity(document.clone())),
                };
                vec![EventBundle {
                    serialized_content: Some(SerializedContent {
                        content_bytes: content.encode_to_vec(),
                    }),
                    ..Default::default()
                }]
            }
            _ => vec![],
        };
        Ok(Response::new(ListEventsResponse {
            event_bundles,
            event_hints: vec![],
        }))
    }

    async fn put_events(
        &self,
        _request: Request<PutEventsRequest>,
    ) -> Result<Response<PutEventsResponse>, Status> {
        Err(Status::unimplemented("not needed for these tests"))
    }

    async fn list_heads(
        &self,
        _request: Request<ListHeadsRequest>,
    ) -> Result<Response<ListHeadsResponse>, Status> {
        Err(Status::unimplemented("not needed for these tests"))
    }

    type SubscribeHeadsStream = tonic::codegen::BoxStream<ListHeadsResponse>;
    async fn subscribe_heads(
        &self,
        _request: Request<SubscribeHeadsRequest>,
    ) -> Result<Response<Self::SubscribeHeadsStream>, Status> {
        Err(Status::unimplemented("not needed for these tests"))
    }

    async fn get_reactions(
        &self,
        _request: Request<GetReactionsRequest>,
    ) -> Result<Response<GetReactionsResponse>, Status> {
        Err(Status::unimplemented("not needed for these tests"))
    }

    async fn get_attributed_to_reaction_counts(
        &self,
        _request: Request<GetAttributedToReactionCountsRequest>,
    ) -> Result<Response<GetAttributedToReactionCountsResponse>, Status> {
        Err(Status::unimplemented("not needed for these tests"))
    }
}

/// Mint a token matching js-core's `createServerJwt` format.
pub fn mint(key: &SigningKey, iss: &str, aud: &str, exp: u64) -> String {
    let kid = hex::encode(key.verifying_key().to_bytes());
    let header = format!(r#"{{"alg":"EdDSA","typ":"JWT","kid":"{kid}"}}"#);
    let claims = format!(r#"{{"iss":"{iss}","aud":"{aud}","iat":0,"exp":{exp}}}"#);
    let signing_input = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(header),
        URL_SAFE_NO_PAD.encode(claims)
    );
    let signature = key.sign(signing_input.as_bytes());
    format!(
        "{signing_input}.{}",
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    )
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// The otlp service on an ephemeral port, trusting `polycentric_url` for
/// identities and forwarding both signals to `victoria_url`. The body limit
/// is small enough that an oversized request still fits the socket buffer,
/// so the client reads the 413 instead of a reset.
pub struct Otlp {
    pub url: String,
    pub client: reqwest::Client,
}

impl Otlp {
    /// One Victoria stand-in for both signals.
    pub async fn serve(polycentric_url: &str, victoria_url: Option<&str>) -> Self {
        Self::serve_relaying(polycentric_url, victoria_url, None).await
    }

    /// With feedback relayed to a Zulip stand-in at `zulip_url`.
    pub async fn serve_relaying(
        polycentric_url: &str,
        victoria_url: Option<&str>,
        zulip_url: Option<&str>,
    ) -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let config: &'static Config = Box::leak(Box::new(Config {
            addr: listener.local_addr().unwrap(),
            allow_hosts: vec![url.clone()],
            query_servers: vec![polycentric_url.to_string()],
            victoria_logs_url: victoria_url.map(str::to_string),
            victoria_traces_url: victoria_url.map(str::to_string),
            max_body_bytes: 8 * 1024,
            zulip: zulip_url.map(|url| Zulip {
                url: url.to_string(),
                bot_email: "bot@example.com".to_string(),
                api_key: "secret".to_string(),
                stream: "harbor-feedback".to_string(),
            }),
            app_url: None,
            grafana: None,
        }));
        let identities = PolycentricIdentities::connect(config.query_servers.clone())
            .await
            .unwrap();
        let state = AppState {
            config,
            http: reqwest::Client::new(),
            identities: Arc::new(identities),
        };
        tokio::spawn(async move {
            axum::serve(listener, build_routes(state)).await.unwrap();
        });
        Self {
            url,
            client: reqwest::Client::new(),
        }
    }

    /// A token for `key` acting as the identity it derives, valid for an hour.
    pub fn token(&self, key: &SigningKey) -> String {
        let (iss, _) = identity_for(key);
        mint(key, &iss, &self.url, now() + 3600)
    }

    pub async fn post(
        &self,
        path: &str,
        token: Option<&str>,
        content_type: &str,
        body: String,
    ) -> reqwest::Response {
        let mut request = self
            .client
            .post(format!("{}{path}", self.url))
            .header("content-type", content_type)
            .body(body);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        request.send().await.unwrap()
    }
}
