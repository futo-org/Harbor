use super::repository as token_repository;
use crate::{
    context::Context,
    expo_client::{ExpoClient, ExpoPushData, ExpoPushRequest, ExpoPushResponse, ExpoRichContent},
};
use log::{debug, warn};
use polycentric_common::models::protos_v2::{
    Content, ContentDigest, Event, EventBundle, EventKey, PublicKey, content::ContentBody,
};
use prost::Message;
use sea_orm::{DbConn, DbErr, EnumIter};
use std::{error::Error, fmt};

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

/// The relevant internal data of a single push notification
struct NotificationData {
    collapse_id: String,
    title: String,
    body: String,
    data: Option<ExpoPushData>,
    rich_content: Option<ExpoRichContent>,
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
        let Some(key) = decoded.key.as_ref() else {
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

        self.process_reply_notifications(ctx, &collapse_id, key, &content)
            .await?;

        self.process_follower_notifications(ctx, &collapse_id, key, &content)
            .await?;

        Ok(())
    }

    /// Dispatches a notification to a user whose post has been replied to (if applicable)
    async fn process_reply_notifications(
        &self,
        ctx: &Context,
        collapse_id: &str,
        key: &EventKey,
        content: &Content,
    ) -> Result<(), NotificationError> {
        let Some(ContentBody::Post(post)) = &content.content_body else {
            return Ok(());
        };

        let author = &key.identity;

        // The reply target, when this is a post replying to someone other
        // than the author (self-replies don't notify).
        let Some(reply_recipient) = post
            .reply
            .as_ref()
            .and_then(|reply| reply.parent.as_ref())
            .map(|parent| parent.identity.clone())
            .filter(|target| target != author)
        else {
            return Ok(());
        };

        // Author's profile (display name + avatar), fetched over gRPC.
        let profile = ctx.polycentric.profile(author).await;
        let title = profile.name.unwrap_or_else(|| "Anonymous".to_string());

        let body = match post.text.is_empty() {
            true => "Replied to your post".to_string(),
            false => "Replied: ".to_string() + &post.text.clone(),
        };

        // Deep link to this reply post, when it carries a signing key.
        let data = key.signed_by.as_ref().map(|signed_by| ExpoPushData {
            url: Self::post_url(author, &signed_by.key, key.sequence),
        });

        let rich_content = Self::avatar_rich_content(ctx, profile.avatar).await;

        debug!("Firing reply notification: from={author} to={reply_recipient} key={key:?}");

        let response = self
            .send_to_identity(
                ctx,
                &reply_recipient,
                NotificationData {
                    collapse_id: collapse_id.to_owned(),
                    title,
                    body,
                    data,
                    rich_content,
                },
            )
            .await?;

        if let Some(errors) = Self::ticket_errors(&response) {
            warn!(
                "Reply notification errors: from={author} to={reply_recipient} key={key:?} errors=[{errors}]"
            );
        }

        Ok(())
    }

    /// Dispatches a notification to a user who is now being followed (if applicable)
    async fn process_follower_notifications(
        &self,
        ctx: &Context,
        collapse_id: &str,
        key: &EventKey,
        content: &Content,
    ) -> Result<(), NotificationError> {
        let Some(ContentBody::Follow(follow)) = &content.content_body else {
            return Ok(());
        };

        let author = &key.identity;

        if &follow.identity == author {
            return Ok(());
        }

        // Follower's profile (display name + avatar), fetched over gRPC.
        let profile = ctx.polycentric.profile(author).await;
        let title = profile.name.unwrap_or_else(|| "Anonymous".to_string());

        // Deep link to the follower's profile.
        let data = Some(ExpoPushData {
            url: Self::profile_url(author),
        });

        let rich_content = Self::avatar_rich_content(ctx, profile.avatar).await;

        debug!(
            "Firing follow notification: from={author} to={} key={key:?}",
            follow.identity
        );

        let response = self
            .send_to_identity(
                ctx,
                &follow.identity,
                NotificationData {
                    collapse_id: collapse_id.to_owned(),
                    title,
                    body: "Followed you".to_string(),
                    data,
                    rich_content,
                },
            )
            .await?;

        if let Some(errors) = Self::ticket_errors(&response) {
            warn!(
                "Follow notification errors: from={author} to={} key={key:?} errors=[{errors}]",
                follow.identity
            );
        }

        Ok(())
    }

    /// Build an app-openable deep link to a specific post, mirroring the
    /// client's `Routes.tabs.post(identity, keyFingerprint, sequence)`:
    /// `polycentric:///{identity}/post/{keyFingerprint}/{sequence}`.
    ///
    /// `signing_key` is the post's signing key (`EventKey.signed_by`); its
    /// first 8 bytes as lowercase hex form the fingerprint, matching the
    /// client's `getKeyFingerprint`.
    fn post_url(identity: &str, signing_key: &[u8], sequence: u64) -> String {
        let key_fingerprint: String = signing_key
            .iter()
            .take(8)
            .map(|b| format!("{b:02x}"))
            .collect();

        // `polycentric` is the app's registered URL scheme (app.config.ts).
        // The empty authority (`:///`) makes expo-router parse the whole tail
        // as the route path.
        format!("polycentric:///{identity}/post/{key_fingerprint}/{sequence}")
    }

    /// Build an app-openable deep link to an identity's profile, mirroring the
    /// client's `Routes.tabs.profile(identity)`: `polycentric:///{identity}`.
    fn profile_url(identity: &str) -> String {
        format!("polycentric:///{identity}")
    }

    /// Build the rich-content image (avatar) for a notification, when the
    /// profile has an avatar and a CDN URL can be resolved. Returns `None`
    /// otherwise — a missing avatar is never an error.
    async fn avatar_rich_content(
        ctx: &Context,
        avatar: Option<ContentDigest>,
    ) -> Option<ExpoRichContent> {
        let digest = avatar?;
        let cdn_url = ctx.polycentric.cdn_url().await?;
        Some(ExpoRichContent {
            image: Self::avatar_url(&cdn_url, &digest),
        })
    }

    /// Build a public blob URL for `digest`, mirroring the server's
    /// `/blob/{type}_{hex(value)}` route (and the client's `blobUrl`).
    fn avatar_url(cdn_url: &str, digest: &ContentDigest) -> String {
        let hex: String = digest.value.iter().map(|b| format!("{b:02x}")).collect();
        format!("{cdn_url}/blob/{}_{}", digest.r#type, hex)
    }

    /// The error details of any failed tickets in a push response,
    /// comma-separated, or `None` when every ticket succeeded. Lets callers
    /// log failures while staying silent on success.
    fn ticket_errors(response: &ExpoPushResponse) -> Option<String> {
        let errors: Vec<&str> = response
            .data
            .iter()
            .filter(|ticket| ticket.status == "error")
            .map(|ticket| {
                ticket
                    .details
                    .as_ref()
                    .and_then(|details| details.error.as_deref())
                    .unwrap_or("unknown error")
            })
            // DeviceNotRegistered is already handled by
            // clean_unregistered_push_tokens
            .filter(|error| *error != "DeviceNotRegistered")
            .collect();

        (!errors.is_empty()).then(|| errors.join(","))
    }

    /// Sends a push notification to every authorized key of an identity that
    /// has a registered token. Tokens reported as invalid by the push service
    /// are unregistered as part of the send.
    async fn send_to_identity(
        &self,
        ctx: &Context,
        identity: &str,
        notification: NotificationData,
    ) -> Result<ExpoPushResponse, NotificationError> {
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
            return Ok(ExpoPushResponse { data: vec![] });
        }

        let expo_tokens_raw: Vec<String> = expo_tokens.iter().map(|item| item.1.clone()).collect();

        let expo_push_request = ExpoPushRequest {
            to: expo_tokens_raw,
            title: notification.title,
            body: notification.body,
            collapse_id: Some(notification.collapse_id),
            data: notification.data,
            rich_content: notification.rich_content,
        };

        let response = self
            .expo_client
            .post_requests(vec![expo_push_request])
            .await?;

        self.clean_unregistered_push_tokens(ctx, &response, expo_tokens)
            .await?;

        Ok(response)
    }

    /// Removes any tokens from a given batch which are no longer registered from the database
    async fn clean_unregistered_push_tokens(
        &self,
        ctx: &Context,
        response: &ExpoPushResponse,
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
    use crate::{context::Context, polycentric::PolycentricClient};
    use polycentric_common::models::{
        collections,
        protos_v2::{
            Content, Event, EventBundle, EventKey, Follow, Identity, KeyType, ListEventsRequest,
            ListEventsResponse, ListHeadsRequest, ListHeadsResponse, Post, PostReply,
            ProfileUpdate, PublicKey, PutEventsRequest, PutEventsResponse, SerializedContent,
            SignedEvent,
            content::ContentBody,
            event_sync_service_server::{EventSyncService, EventSyncServiceServer},
        },
    };
    use prost::Message;
    use push_notifications_entity::push_token_model as PushTokenModel;
    use sea_orm::{DatabaseConnection, DbBackend, MockDatabase, MockExecResult};
    use time::OffsetDateTime;
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
                                alias: None,
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
            Ok(Response::new(PutEventsResponse {
                errors: vec![],
                requested_blobs: vec![],
            }))
        }

        async fn list_heads(
            &self,
            _request: Request<ListHeadsRequest>,
        ) -> Result<Response<ListHeadsResponse>, Status> {
            Err(Status::unimplemented("not needed for these tests"))
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
                // Known signing key so post_url's fingerprint (first 8 bytes
                // as hex → "abababababababab") is deterministic/assertable.
                signed_by: Some(PublicKey {
                    key_type: KeyType::Ed25519 as i32,
                    key: vec![0xAB; 32],
                }),
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
            meta: None,
        }
    }

    /// A post by `author` replying to a post by `parent_identity`, carrying
    /// the given `text` body.
    fn reply_post_bundle_with_text(author: &str, parent_identity: &str, text: &str) -> EventBundle {
        authored_bundle(
            author,
            Content {
                content_body: Some(ContentBody::Post(Post {
                    text: text.to_string(),
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
                    links: vec![],
                    quote: None,
                })),
            },
        )
    }

    /// A post by `author` replying to a post by `parent_identity` (body "hi").
    fn reply_post_bundle(author: &str, parent_identity: &str) -> EventBundle {
        reply_post_bundle_with_text(author, parent_identity, "hi")
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
                    links: vec![],
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
            created_at: OffsetDateTime::UNIX_EPOCH,
            updated_at: OffsetDateTime::UNIX_EPOCH,
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
                r#"[{"to":["ExponentPushToken[abc123]"],"title":"Alice","body":"Replied: hi","collapseId":"000102030405060708090a0b0c0d0e0f101112131415161718191a1b","data":{"url":"polycentric:///id-author/post/abababababababab/1"}}]"#
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

    /// A reply with an empty text body falls back to the generic
    /// "Replied to your post" body rather than "Replied: ".
    #[tokio::test]
    async fn process_event_reply_with_no_text_uses_generic_body() {
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
            .append_query_results([vec![token_row(&pk.key, "ExponentPushToken[abc123]")]])
            .into_connection();

        let ctx = make_ctx(db, expo_push_url, polycentric);
        let bundle = reply_post_bundle_with_text("id-author", "id-recipient", "");

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
                r#"[{"to":["ExponentPushToken[abc123]"],"title":"Alice","body":"Followed you","collapseId":"000102030405060708090a0b0c0d0e0f101112131415161718191a1b","data":{"url":"polycentric:///id-author"}}]"#
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
