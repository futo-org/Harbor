use std::{error::Error, fmt};

use log::warn;
use sea_orm::{DbConn, DbErr, EnumIter};

use super::repository as token_repository;
use crate::{
    context::Context,
    expo_client::{ExpoClient, ExpoPushRequest, ExpoPushResponse},
};
use polycentric_common::models::protos_v2::{
    Content, Event, EventBundle, PublicKey, content::ContentBody,
};
use prost::Message;

#[derive(EnumIter)]
pub enum PushService {
    Expo,
}

impl AsRef<str> for PushService {
    fn as_ref(&self) -> &str {
        match self {
            PushService::Expo => "expo",
        }
    }
}

#[derive(Debug)]
pub enum NotificationError {
    UnknownService(String),
    Database(DbErr),
    PushService(String),
}

impl fmt::Display for NotificationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NotificationError::UnknownService(s) => {
                write!(f, "unknown push service: {s}")
            }
            NotificationError::Database(e) => write!(f, "database error: {e}"),
            NotificationError::PushService(e) => {
                write!(f, "push service error: {e}")
            }
        }
    }
}

impl Error for NotificationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            NotificationError::Database(e) => Some(e),
            _ => None,
        }
    }
}

impl From<DbErr> for NotificationError {
    fn from(e: DbErr) -> Self {
        NotificationError::Database(e)
    }
}

pub struct NotificationManager {
    expo_client: ExpoClient,
}

impl NotificationManager {
    pub fn new(expo_access_token: Option<String>) -> Self {
        NotificationManager {
            expo_client: ExpoClient::new(expo_access_token),
        }
    }

    #[cfg(test)]
    pub fn with_custom_push_url(expo_access_token: Option<String>, push_url: String) -> Self {
        NotificationManager {
            expo_client: ExpoClient::with_custom_push_url(expo_access_token, push_url),
        }
    }

    /// Registers a push token for a public key after verifying that the
    /// service is supported and the token is well-formed.
    pub async fn register(
        &self,
        db: &DbConn,
        public_key: &PublicKey,
        service: String,
        token: String,
    ) -> Result<(), NotificationError> {
        self.verify_token(&service, &token).await?;

        token_repository::Mutation::register(db, public_key, service, token).await?;

        Ok(())
    }

    /// Remove a registered push token for `public_key`.
    pub async fn unregister(
        &self,
        db: &DbConn,
        public_key: &PublicKey,
        service: &str,
        token: &str,
    ) -> Result<(), NotificationError> {
        token_repository::Mutation::unregister(db, public_key, service, token).await?;

        Ok(())
    }

    /// Handle the sending of all notifications relevant to a given event.
    pub async fn process_event(
        &self,
        ctx: &Context,
        event: &EventBundle,
    ) -> Result<(), NotificationError> {
        // Decode the signed event (for the author identity) and its
        // content (to detect replies). Anything that doesn't decode just
        // produces no notification.
        let Some(signed) = event.signed_event.as_ref() else {
            return Ok(());
        };
        let Ok(decoded) = Event::decode(signed.event_bytes.as_slice()) else {
            return Ok(());
        };
        let Some(author) = decoded.key.as_ref().map(|key| key.identity.clone()) else {
            return Ok(());
        };

        let Some(serialized) = event.serialized_content.as_ref() else {
            return Ok(());
        };
        let Ok(content) = Content::decode(serialized.content_bytes.as_slice()) else {
            return Ok(());
        };

        let collapse_id: String = signed
            .signature
            .iter()
            .take(28) // APNs has a strict 64 byte limit for the collapseId field
            .map(|b| format!("{b:02x}"))
            .collect();

        self.process_reply_notifications(ctx, &collapse_id, &author, &content)
            .await?;

        self.process_follower_notifications(ctx, &collapse_id, &author, &content)
            .await?;

        Ok(())
    }

    /// Dispatches a notification to a user whose post has been replied to (if applicable)
    async fn process_reply_notifications(
        &self,
        ctx: &Context,
        collapse_id: &String,
        author: &String,
        content: &Content,
    ) -> Result<(), NotificationError> {
        // The reply target, when this is a post replying to someone other
        // than the author (self-replies don't notify).
        let reply_recipient: Option<String> = match &content.content_body {
            Some(ContentBody::Post(post)) => post
                .reply
                .as_ref()
                .and_then(|reply| reply.parent.as_ref())
                .map(|parent| parent.identity.clone())
                .filter(|target| target != author),
            _ => return Ok(()),
        };

        if let Some(recipient) = reply_recipient {
            // Title is the author's display name, fetched over gRPC.
            let title = ctx
                .polycentric
                .display_name(&author)
                .await
                .unwrap_or_else(|| "Anonymous".to_string());

            self.send_to_identity(
                ctx,
                &recipient,
                collapse_id.clone(),
                title,
                "Replied to your post".to_string(),
            )
            .await?;
        };

        Ok(())
    }

    /// Dispatches a notification to a user who is now being followed (if applicable)
    async fn process_follower_notifications(
        &self,
        ctx: &Context,
        collapse_id: &String,
        author: &String,
        content: &Content,
    ) -> Result<(), NotificationError> {
        // The followee target, when this is a follow of someone other than the
        // author (self-follows don't notify).
        let followed_profile: Option<String> = match &content.content_body {
            Some(ContentBody::Follow(follow)) => {
                Some(follow.identity.clone()).filter(|target| target != author)
            }
            _ => None,
        };

        if let Some(followee) = followed_profile {
            // Title is the author's display name, fetched over gRPC.
            let title = ctx
                .polycentric
                .display_name(&author)
                .await
                .unwrap_or_else(|| "Anonymous".to_string());

            self.send_to_identity(
                ctx,
                &followee,
                collapse_id.clone(),
                title,
                "Followed you".to_string(),
            )
            .await?;
        };

        Ok(())
    }

    /// Sends a push notification to every authorized key of an identity that
    /// has a registered token. Tokens reported as invalid by the push service
    /// are unregistered as part of the send.
    async fn send_to_identity(
        &self,
        ctx: &Context,
        identity: &str,
        collapse_id: String,
        title: String,
        body: String,
    ) -> Result<(), NotificationError> {
        let authorized_keys = ctx.polycentric.authorized_keys(identity).await;

        let mut rows = vec![];

        for key in authorized_keys {
            let token_res = token_repository::Query::token_for_public_key(&ctx.db, &key).await?;
            if let Some(token) = token_res {
                rows.push(token);
            }
        }

        let mut expo_tokens: Vec<(PublicKey, String)> = vec![];
        for row in rows {
            let public_key = PublicKey {
                key: row.public_key,
                key_type: row.public_key_type as i32,
            };

            expo_tokens.push((public_key, row.token));
        }

        if expo_tokens.is_empty() {
            return Ok(());
        }

        let expo_tokens_raw: Vec<String> = expo_tokens.iter().map(|item| item.1.clone()).collect();

        let expo_push_request = ExpoPushRequest {
            to: expo_tokens_raw,
            title,
            body,
            collapse_id: Some(collapse_id),
        };

        let response = self
            .expo_client
            .post_requests(vec![expo_push_request])
            .await?;

        self.clean_unregistered_push_tokens(ctx, response, expo_tokens)
            .await?;

        Ok(())
    }

    /// Removes any tokens from a given batch which are no longer registered from the database
    async fn clean_unregistered_push_tokens(
        &self,
        ctx: &Context,
        response: ExpoPushResponse,
        expo_tokens: Vec<(PublicKey, String)>,
    ) -> Result<(), NotificationError> {
        if response.data.len() != expo_tokens.len() {
            warn!(
                "expo ticket count ({}) != token count ({}); skipping token cleanup",
                response.data.len(),
                expo_tokens.len()
            );
            return Ok(());
        }

        for (key_and_token, ticket) in expo_tokens.iter().zip(response.data.iter()) {
            if ticket.status != "error" {
                continue;
            }

            let error = ticket.details.as_ref().and_then(|d| d.error.as_deref());

            if error == Some("DeviceNotRegistered") {
                // The device's token is no longer valid — remove it.
                token_repository::Mutation::unregister(
                    &ctx.db,
                    &key_and_token.0,
                    PushService::Expo.as_ref(),
                    &key_and_token.1,
                )
                .await?;
            } else {
                warn!(
                    "expo push ticket error (token kept): {}",
                    error.unwrap_or("unknown error")
                );
            }
        }

        // Polling expo.get_push_notification_receipts would have added too much complexity
        // to be worthwhile in this initial implementation

        // However, it may become neccessary if we run into rate limiting issues
        // related to dead tokens

        Ok(())
    }

    /// Verifies that a token/service pair is valid and supported
    /// Expo is the only currently supported notification service
    async fn verify_token(&self, service: &str, _token: &str) -> Result<(), NotificationError> {
        if service == PushService::Expo.as_ref() {
            Ok(())
        } else {
            Err(NotificationError::UnknownService(service.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{NotificationManager, PushService};
    use crate::context::Context;
    use crate::polycentric::PolycentricClient;
    use notifications_entity::push_token_model as PushTokenModel;
    use polycentric_common::models::collections;
    use polycentric_common::models::protos_v2::{
        Content, Event, EventBundle, EventKey, Follow, Identity, KeyType, ListEventsRequest,
        ListEventsResponse, Post, PostReply, ProfileUpdate, PublicKey, PutEventsRequest,
        PutEventsResponse, SerializedContent, SignedEvent,
        content::ContentBody,
        event_sync_service_server::{EventSyncService, EventSyncServiceServer},
    };
    use prost::Message;
    use sea_orm::{DatabaseConnection, DbBackend, MockDatabase, MockExecResult};
    use tokio_stream::wrappers::TcpListenerStream;
    use tonic::{Request, Response, Status};

    /// A mock `EventSyncService` that answers `ListEvents` with canned data
    /// per collection: a PROFILE event carrying `profile_name`, and an
    /// IDENTITY event carrying `identity_keys`. Every other query is empty.
    #[derive(Clone)]
    struct MockEventSync {
        profile_name: Option<String>,
        identity_keys: Vec<PublicKey>,
    }

    #[tonic::async_trait]
    impl EventSyncService for MockEventSync {
        async fn list_events(
            &self,
            request: Request<ListEventsRequest>,
        ) -> Result<Response<ListEventsResponse>, Status> {
            let collection = request.into_inner().filters.and_then(|f| f.collection);

            let event_bundles = match collection {
                Some(c) if c == collections::PROFILE => self
                    .profile_name
                    .clone()
                    .map(|name| {
                        vec![canned_bundle(Content {
                            content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
                                name: Some(name),
                                avatar: None,
                                banner: None,
                                description: None,
                            })),
                        })]
                    })
                    .unwrap_or_default(),
                Some(c) if c == collections::IDENTITY => {
                    if self.identity_keys.is_empty() {
                        vec![]
                    } else {
                        vec![canned_bundle(Content {
                            content_body: Some(ContentBody::Identity(Identity {
                                rotation_keys: vec![],
                                signing_keys: self.identity_keys.clone(),
                                revocation_bounds: vec![],
                            })),
                        })]
                    }
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
            Ok(Response::new(PutEventsResponse { errors: vec![] }))
        }
    }

    /// Spawn `mock` on an ephemeral local port and return a client pointed
    /// at it. The listener is bound before serving, so the lazily-connecting
    /// client never races the bind.
    async fn spawn_polycentric(mock: MockEventSync) -> PolycentricClient {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(EventSyncServiceServer::new(mock))
                .serve_with_incoming(TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        PolycentricClient::new(vec![format!("http://{addr}")])
    }

    /// Wrap `content` in a minimal bundle. `latest_content` only decodes —
    /// it never verifies — so an unsigned, sequence-1 event suffices.
    fn canned_bundle(content: Content) -> EventBundle {
        authored_bundle("", content)
    }

    /// Build a bundle authored by `author` carrying `content`.
    fn authored_bundle(author: &str, content: Content) -> EventBundle {
        let event = Event {
            key: Some(EventKey {
                collection: collections::FEED,
                identity: author.to_string(),
                signed_by: None,
                sequence: 1,
            }),
            identity_sequence: 0,
            vector_clock: None,
            previous_signature: vec![],
            content_digest: None,
            created_at: 0,
            previous_root: vec![],
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                // Non-empty 64-byte signature (bytes 0x00..0x3f) so collapse_id
                // derivation — hex of the first 28 bytes, with no type prefix —
                // is exercised and assertable by the happy-path tests.
                signature: (0u8..64).collect(),
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: Some(SerializedContent {
                content_bytes: content.encode_to_vec(),
            }),
            event_proofs: vec![],
        }
    }

    /// A post by `author` replying to a post by `parent_identity`.
    fn reply_post_bundle(author: &str, parent_identity: &str) -> EventBundle {
        authored_bundle(
            author,
            Content {
                content_body: Some(ContentBody::Post(Post {
                    text: "hi".to_string(),
                    reply: Some(PostReply {
                        root: None,
                        parent: Some(EventKey {
                            collection: collections::FEED,
                            identity: parent_identity.to_string(),
                            signed_by: None,
                            sequence: 1,
                        }),
                    }),
                    images: vec![],
                    quote: None,
                })),
            },
        )
    }

    /// A plain (non-reply) post by `author`.
    fn plain_post_bundle(author: &str) -> EventBundle {
        authored_bundle(
            author,
            Content {
                content_body: Some(ContentBody::Post(Post {
                    text: "hi".to_string(),
                    reply: None,
                    images: vec![],
                    quote: None,
                })),
            },
        )
    }

    /// A follow of `followee` authored by `author`.
    fn follow_bundle(author: &str, followee: &str) -> EventBundle {
        authored_bundle(
            author,
            Content {
                content_body: Some(ContentBody::Follow(Follow {
                    identity: followee.to_string(),
                })),
            },
        )
    }

    /// A registered Expo `push_token` row for `public_key`.
    fn token_row(public_key: &[u8], token: &str) -> PushTokenModel::Model {
        PushTokenModel::Model {
            public_key_type: KeyType::Ed25519 as i16,
            public_key: public_key.to_vec(),
            service: PushService::Expo.as_ref().to_string(),
            token: token.to_string(),
            created_at: time::PrimitiveDateTime::MIN,
        }
    }

    fn test_public_key(byte: u8) -> PublicKey {
        PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: vec![byte; 32],
        }
    }

    fn make_ctx(
        db: DatabaseConnection,
        expo_push_url: String,
        polycentric: PolycentricClient,
    ) -> Context {
        Context {
            db,
            notification_manager: NotificationManager::with_custom_push_url(None, expo_push_url),
            polycentric,
            main_server: String::new(),
        }
    }

    /// Reply path end-to-end: a reply post triggers exactly one Expo push to
    /// the reply recipient, titled with the author's RPC-fetched display name.
    #[tokio::test]
    async fn process_event_notifies_reply_recipient_via_expo() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"[{"to":["ExponentPushToken[abc123]"],"title":"Alice","body":"Replied to your post","collapseId":"000102030405060708090a0b0c0d0e0f101112131415161718191a1b"}]"#
                    .to_string(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"ok","id":"00000000-0000-0000-0000-000000000001"}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let pk = test_public_key(1);
        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![pk.clone()],
        })
        .await;

        let db = MockDatabase::new(DbBackend::Postgres)
            // token_for_public_key(recipient's authorized key) → one token
            .append_query_results([vec![token_row(&pk.key, "ExponentPushToken[abc123]")]])
            .into_connection();

        let ctx = make_ctx(db, expo_push_url, polycentric);
        let bundle = reply_post_bundle("id-author", "id-recipient");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
    }

    /// A `DeviceNotRegistered` ticket from Expo removes the token via a
    /// DELETE on `push_token`.
    /// Whether the mock DB recorded a DELETE against `push_token`. Consumes
    /// the connection (it drains the transaction log).
    fn saw_push_token_delete(db: DatabaseConnection) -> bool {
        db.into_transaction_log().iter().any(|tx| {
            tx.statements().iter().any(|stmt| {
                let sql = stmt.sql.to_ascii_uppercase();
                sql.starts_with("DELETE") && sql.contains("PUSH_TOKEN")
            })
        })
    }

    /// A `DeviceNotRegistered` ticket from Expo removes the token via a
    /// DELETE on `push_token`.
    #[tokio::test]
    async fn process_event_unregisters_token_on_device_not_registered() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"error","message":"not registered","details":{"error":"DeviceNotRegistered"}}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let pk = test_public_key(5);
        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![pk.clone()],
        })
        .await;

        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![token_row(&pk.key, "ExponentPushToken[dead-device]")]])
            // unregister DELETE — sea-orm issues this as exec, not query.
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        let ctx = make_ctx(db.clone(), expo_push_url, polycentric);
        let bundle = reply_post_bundle("id-author", "id-recipient");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;

        assert!(
            saw_push_token_delete(db),
            "expected an unregister DELETE on push_token"
        );
    }

    /// A non-reply post produces no notification, so Expo is never called.
    #[tokio::test]
    async fn process_event_ignores_post_without_reply() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_body("{}")
            .expect(0)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![],
        })
        .await;

        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let ctx = make_ctx(db, expo_push_url, polycentric);
        let bundle = plain_post_bundle("id-author");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
    }

    /// Replying to your own post is not a notification to yourself.
    #[tokio::test]
    async fn process_event_skips_self_reply() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_body("{}")
            .expect(0)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![],
        })
        .await;

        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let ctx = make_ctx(db, expo_push_url, polycentric);
        // Author replies to themselves → filtered out.
        let bundle = reply_post_bundle("id-author", "id-author");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
    }

    /// Follow path end-to-end: a follow triggers exactly one Expo push to the
    /// followed profile, titled with the follower's RPC-fetched display name.
    #[tokio::test]
    async fn process_event_notifies_followed_profile_via_expo() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"[{"to":["ExponentPushToken[abc123]"],"title":"Alice","body":"Followed you","collapseId":"000102030405060708090a0b0c0d0e0f101112131415161718191a1b"}]"#
                    .to_string(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"ok","id":"00000000-0000-0000-0000-000000000001"}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let pk = test_public_key(1);
        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![pk.clone()],
        })
        .await;

        let db = MockDatabase::new(DbBackend::Postgres)
            // token_for_public_key(followee's authorized key) → one token
            .append_query_results([vec![token_row(&pk.key, "ExponentPushToken[abc123]")]])
            .into_connection();

        let ctx = make_ctx(db, expo_push_url, polycentric);
        let bundle = follow_bundle("id-author", "id-followee");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
    }

    /// Following yourself is not a notification to yourself.
    #[tokio::test]
    async fn process_event_skips_self_follow() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_body("{}")
            .expect(0)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![],
        })
        .await;

        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let ctx = make_ctx(db, expo_push_url, polycentric);
        // Author follows themselves → filtered out.
        let bundle = follow_bundle("id-author", "id-author");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
    }

    /// When Expo returns a ticket count that doesn't match the number of
    /// tokens sent, positional correlation is unreliable, so the unregister
    /// pass is skipped entirely — no token is removed (even though the
    /// tickets say `DeviceNotRegistered`).
    #[tokio::test]
    async fn process_event_skips_token_cleanup_on_ticket_count_mismatch() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            // Two tickets for a single token → count mismatch.
            .with_body(
                r#"{"data":[{"status":"error","details":{"error":"DeviceNotRegistered"}},{"status":"error","details":{"error":"DeviceNotRegistered"}}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let pk = test_public_key(6);
        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![pk.clone()],
        })
        .await;

        // Only the token lookup is queued. If the guard failed and an
        // unregister were attempted, MockDatabase would error on the missing
        // exec result and the test would fail.
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![token_row(&pk.key, "ExponentPushToken[abc123]")]])
            .into_connection();

        let ctx = make_ctx(db.clone(), expo_push_url, polycentric);
        let bundle = reply_post_bundle("id-author", "id-recipient");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
        assert!(
            !saw_push_token_delete(db),
            "a ticket/token count mismatch must skip token cleanup"
        );
    }

    /// A ticket error other than `DeviceNotRegistered` (e.g. a transient
    /// `MessageRateExceeded`) must not unregister the token.
    #[tokio::test]
    async fn process_event_keeps_token_on_non_device_not_registered_error() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"error","message":"rate limited","details":{"error":"MessageRateExceeded"}}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo_push_url = format!("{}/--/api/v2/push/send", expo_server.url());

        let pk = test_public_key(7);
        let polycentric = spawn_polycentric(MockEventSync {
            profile_name: Some("Alice".to_string()),
            identity_keys: vec![pk.clone()],
        })
        .await;

        // No exec result queued: an erroneous unregister would error out.
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![token_row(&pk.key, "ExponentPushToken[rate-limited]")]])
            .into_connection();

        let ctx = make_ctx(db.clone(), expo_push_url, polycentric);
        let bundle = reply_post_bundle("id-author", "id-recipient");

        ctx.notification_manager
            .process_event(&ctx, &bundle)
            .await
            .expect("process_event should succeed");

        send_mock.assert_async().await;
        assert!(
            !saw_push_token_delete(db),
            "non-DeviceNotRegistered errors must not unregister the token"
        );
    }
}
