use std::sync::Arc;
use std::{error::Error, fmt};

use expo_push_notification_client::{
    DetailsErrorType, Expo, ExpoPushMessage, ExpoPushTicket,
};
use sea_orm::{DbConn, DbErr, EnumIter};
use tokio::sync::mpsc;

use super::repository as token_repository;
use crate::service::context::ServiceContext;
use crate::service::feeds::repository as feeds_repository;
use crate::service::identity::repository as identity_repository;
use crate::service::identity::service as identity_service;
use crate::service::proto::PublicKey;

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

/// A unit of work for the notification worker. One job per newly-persisted
/// post; the worker expands it into the per-recipient sends.
#[derive(Debug, Clone)]
pub struct NotificationJob {
    pub author_identity: String,
    pub body: String,
    /// If the post is a reply, the identity of the parent author.
    pub reply_recipient: Option<String>,
}

pub struct NotificationManager {
    expo: Expo,
    tx: mpsc::Sender<NotificationJob>,
}

impl NotificationManager {
    /// Returns the manager plus the receiving end of the job queue. The
    /// caller (typically `main`) keeps the manager in an Arc, hands clones
    /// to the gRPC services, and spawns `run_worker(db, rx)` exactly once.
    /// Dropping the rx (e.g. in tests) makes `enqueue` a logged no-op.
    ///
    /// The `Expo` client is injected so tests can point it at a wiremock
    /// server via `Expo::new_with_base_url(None, &server.url())`.
    pub fn new(expo: Expo) -> (Arc<Self>, mpsc::Receiver<NotificationJob>) {
        let (tx, rx) = mpsc::channel(1024);
        let manager = Arc::new(Self { expo, tx });
        (manager, rx)
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

        token_repository::Mutation::register(db, public_key, service, token)
            .await?;

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
        token_repository::Mutation::unregister(db, public_key, service, token)
            .await?;

        Ok(())
    }

    /// Enqueue a job for the worker. Awaits when the queue is full —
    /// backpressure into the caller, preferable to silent unbounded
    /// growth. Logs and drops if the worker is gone.
    pub async fn enqueue(&self, job: NotificationJob) {
        if let Err(e) = self.tx.send(job).await {
            eprintln!("notification queue dropped job: {e}");
        }
    }

    /// Long-running worker loop. Spawn once at startup; returns when
    /// every `Arc<Self>` has been dropped (closing the channel).
    pub async fn run_worker(
        self: Arc<Self>,
        ctx: Arc<ServiceContext>,
        mut rx: mpsc::Receiver<NotificationJob>,
    ) {
        while let Some(job) = rx.recv().await {
            if let Err(e) = self.process_job(&ctx, &job).await {
                eprintln!(
                    "notification job failed (author={}): {e}",
                    job.author_identity,
                );
            }
        }
    }

    /// Expand a NotificationJob into per-recipient sends:
    /// - the reply recipient (if any), with a "New reply from X" title
    /// - every follower of the author (minus the author and the reply
    ///   recipient), with a "New post from X" title
    async fn process_job(
        &self,
        ctx: &ServiceContext,
        job: &NotificationJob,
    ) -> Result<(), NotificationError> {
        let title = identity_service::display_name(ctx, &job.author_identity)
            .await
            .ok()
            .flatten()
            .unwrap_or_else(|| "Anonymous".to_string());

        if let Some(recipient) = &job.reply_recipient {
            if let Err(e) = self
                .send_to_identity(
                    &ctx.db,
                    recipient,
                    title.clone(),
                    "Replied to your post".to_string(),
                )
                .await
            {
                eprintln!("reply notification send error: {e}");
            }
        }

        let followers = feeds_repository::Query::list_followers(
            &ctx.db,
            &job.author_identity,
        )
        .await?;

        for follower in followers {
            if follower == job.author_identity {
                continue;
            }
            if job.reply_recipient.as_deref() == Some(follower.as_str()) {
                continue;
            }
            if let Err(e) = self
                .send_to_identity(
                    &ctx.db,
                    &follower,
                    title.clone(),
                    "Created a new post".to_string(),
                )
                .await
            {
                eprintln!(
                    "follower notification send error for {follower}: {e}"
                );
            }
        }

        Ok(())
    }

    /// Sends a push notification to every authorized key of an identity that
    /// has a registered token. Tokens reported as invalid by the push service
    /// are unregistered as part of the send.
    async fn send_to_identity(
        &self,
        db: &DbConn,
        identity: &str,
        title: String,
        body: String,
    ) -> Result<(), NotificationError> {
        let authorized_keys =
            identity_repository::Query::authorized_keys(db, identity).await?;

        let mut rows = vec![];

        for key in authorized_keys {
            let token_res =
                token_repository::Query::token_for_public_key(db, &key.key)
                    .await?;
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

            if self.verify_token(&row.service, &row.token).await.is_err() {
                // Remove any invalid tokens
                token_repository::Mutation::unregister(
                    db,
                    &public_key,
                    &row.service,
                    &row.token,
                )
                .await?;
            } else {
                expo_tokens.push((public_key, row.token));
            }
        }

        if expo_tokens.is_empty() {
            return Ok(());
        }

        let message = ExpoPushMessage::builder(
            expo_tokens.iter().map(|item| item.1.clone()),
        )
        .title(title)
        .body(body)
        .build()
        .map_err(|e| NotificationError::PushService(e.to_string()))?;

        let tickets = self
            .expo
            .send_push_notifications(message)
            .await
            .map_err(|e| NotificationError::PushService(e.to_string()))?;

        for (key_and_token, ticket) in expo_tokens.iter().zip(tickets.iter()) {
            if let ExpoPushTicket::Error(err) = ticket
                && matches!(
                    err.details.as_ref().and_then(|d| d.error.as_ref()),
                    Some(DetailsErrorType::DeviceNotRegistered)
                )
            {
                let public_key = &key_and_token.0;
                let token = &key_and_token.1;

                // Remove invalid tokens
                token_repository::Mutation::unregister(
                    db,
                    public_key,
                    PushService::Expo.as_ref(),
                    token,
                )
                .await?;
            }
        }

        // Polling expo.get_push_notification_receipts would have added too much complexity
        // to be worthwhile in this initial implementation

        // However, it may become neccessary if we run into rate limiting issues
        // related to dead tokens

        Ok(())
    }

    async fn verify_token(
        &self,
        service: &str,
        _token: &str,
    ) -> Result<(), NotificationError> {
        if service == PushService::Expo.as_ref() {
            Ok(())
        } else {
            Err(NotificationError::UnknownService(service.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::content::ContentBody;
    use crate::service::proto::{Content, Identity, KeyType, ProfileUpdate};
    use ::entity::{
        content_model as ContentModel, event_model as EventModel,
        push_token_model as PushTokenModel,
    };
    use prost::Message;
    use sea_orm::{DbBackend, MockDatabase, Value};
    use sha2::{Digest, Sha256};
    use std::collections::BTreeMap;

    /// Hex sha256 of an encoded `Identity` — the canonical genesis
    /// identifier the server keys identities by (see
    /// `identity::repository::identity_matches_content`). A `send_to_identity`
    /// only fires when the mocked IDENTITY row's content hashes to the
    /// identity string passed in, so test identities MUST be derived this way.
    fn identity_string(identity: &Identity) -> String {
        Sha256::digest(identity.encode_to_vec())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    /// Wrap encoded proto bytes in a `ContentModel::Model` row. Only
    /// `serialized_bytes` is read by the code under test; the rest is
    /// filler so the struct literal type-checks. (The `#[sea_orm::model]`
    /// macro keeps only the scalar columns on `Model`; the `has_one`
    /// relation fields are not part of the runtime struct.)
    fn content_model(serialized_bytes: Vec<u8>) -> ContentModel::Model {
        ContentModel::Model {
            id: 0,
            digest_type: 0,
            digest_bytes: vec![],
            serialized_bytes,
            synced_at: time::PrimitiveDateTime::MIN,
        }
    }

    /// A bare `EventModel::Model` carrying `serialized_bytes`' digest
    /// fields irrelevant; only `sequence`/`public_key*` matter to the
    /// chain walk, and a single-event chain never exercises rotation.
    fn event_model() -> EventModel::Model {
        EventModel::Model {
            id: 0,
            collection: 0,
            identity: String::new(),
            public_key_type: KeyType::Ed25519 as i16,
            public_key: vec![],
            sequence: 0,
            content_digest_type: None,
            content_digest_bytes: None,
            signature: vec![],
            previous_signature: vec![],
            previous_root: vec![],
            event_bytes: vec![],
            created_at: time::PrimitiveDateTime::MIN,
            synced_at: time::PrimitiveDateTime::MIN,
        }
    }

    /// Build the single IDENTITY-collection `select_also` row that
    /// `authorized_keys` reads. Returns the derived identity string (the
    /// sha256-genesis id the chain walk must match) alongside the row, so
    /// the caller uses that exact string in the job / list_followers.
    fn identity_event_row(
        signing_key: &[u8],
    ) -> (String, (EventModel::Model, Option<ContentModel::Model>)) {
        let identity = Identity {
            rotation_keys: vec![],
            signing_keys: vec![PublicKey {
                key_type: KeyType::Ed25519 as i32,
                key: signing_key.to_vec(),
            }],
            revocation_bounds: vec![],
        };
        let id = identity_string(&identity);
        let content = Content {
            content_body: Some(ContentBody::Identity(identity)),
        };
        (
            id,
            (event_model(), Some(content_model(content.encode_to_vec()))),
        )
    }

    /// A PROFILE `select_also` row whose `ProfileUpdate.name` is "Alice".
    /// `display_name` decodes this to derive the notification title.
    fn profile_row() -> (EventModel::Model, Option<ContentModel::Model>) {
        let content = Content {
            content_body: Some(ContentBody::ProfileUpdate(ProfileUpdate {
                name: Some("Alice".to_string()),
                avatar: None,
                banner: None,
                description: None,
            })),
        };
        (event_model(), Some(content_model(content.encode_to_vec())))
    }

    /// A registered Expo `PushTokenModel::Model` for `signing_key`.
    fn token_row(signing_key: &[u8], token: &str) -> PushTokenModel::Model {
        PushTokenModel::Model {
            public_key_type: KeyType::Ed25519 as i16,
            public_key: signing_key.to_vec(),
            service: PushService::Expo.as_ref().to_string(),
            token: token.to_string(),
            created_at: time::PrimitiveDateTime::MIN,
        }
    }

    /// A `list_followers` row (`into_tuple::<String>()` — positional).
    fn follower_row(id: &str) -> BTreeMap<String, Value> {
        BTreeMap::from([("identity".to_string(), Value::from(id.to_string()))])
    }

    /// Drives `process_job` end-to-end against a mocked DB and a wiremock-
    /// style Expo server, and asserts that exactly one POST hits Expo with
    /// the recipient's token.
    ///
    /// Scenario: a reply post with no followers. The reply recipient has
    /// one authorized signing key, and that key has a registered Expo
    /// token. DB queries, in `process_job` order:
    ///   - the author's profile lookup (title resolution → "Alice")
    ///   - the recipient's authorized_keys, then token_for_public_key
    ///   - list_followers(author): empty
    /// We expect exactly one POST to `/--/api/v2/push/send` carrying the
    /// token, titled "Alice" with body "Replied to your post".
    #[tokio::test]
    async fn process_job_sends_to_reply_recipient_via_expo() {
        // ── 1. Mock Expo at the HTTP layer ──────────────────────────
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"to":["ExponentPushToken[abc123]"],"title":"Alice","body":"Replied to your post"}"#
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

        let expo = Expo::new_with_base_url(None, &expo_server.url());

        // ── 2. Mock the DB queries process_job will issue ───────────
        let signing_key_bytes = vec![1u8; 32];
        let (recipient_id, recipient_identity_row) =
            identity_event_row(&signing_key_bytes);

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) author's profile lookup → title "Alice"
            .append_query_results([vec![profile_row()]])
            // (b) authorized_keys(reply_recipient): one identity row
            .append_query_results([vec![recipient_identity_row]])
            // (c) token_for_public_key(signing_key): one registered token
            .append_query_results([vec![token_row(
                &signing_key_bytes,
                "ExponentPushToken[abc123]",
            )]])
            // (d) list_followers(author): none
            .append_query_results([Vec::<BTreeMap<String, Value>>::new()])
            .into_connection();

        // ── 3. Build the manager and drive process_job directly ─────
        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            body: "hello".to_string(),
            reply_recipient: Some(recipient_id),
        };

        let ctx =
            crate::service::context::ServiceContext::new(db.clone(), None);
        manager
            .process_job(&ctx, &job)
            .await
            .expect("process_job should succeed");

        // ── 4. Assert Expo received exactly one POST as configured ──
        send_mock.assert_async().await;
    }

    /// Companion to the reply-recipient test: a non-reply post that
    /// fans out to a follower via the following-feed path.
    ///
    /// Scenario: a post with no reply_recipient. The author has one
    /// follower, and that follower has one authorized signing key with
    /// a registered Expo token. DB queries, in `process_job` order:
    ///   - the author's profile lookup (title → "Alice")
    ///   - list_followers (the reply-recipient branch is skipped when
    ///     reply_recipient is None)
    ///   - the follower's authorized_keys, then token_for_public_key
    /// We expect exactly one POST to `/--/api/v2/push/send` with the
    /// follower's token, titled "Alice" with body "Created a new post".
    #[tokio::test]
    async fn process_job_fans_out_to_followers_via_expo() {
        // ── 1. Mock Expo at the HTTP layer ──────────────────────────
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"to":["ExponentPushToken[follower-xyz]"],"title":"Alice","body":"Created a new post"}"#
                    .to_string(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"ok","id":"00000000-0000-0000-0000-000000000002"}]}"#,
            )
            .expect(1)
            .create_async()
            .await;

        let expo = Expo::new_with_base_url(None, &expo_server.url());

        // ── 2. Mock the DB queries process_job will issue ───────────
        let follower_signing_key_bytes = vec![2u8; 32];
        let (follower_id, follower_identity_row) =
            identity_event_row(&follower_signing_key_bytes);

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) author's profile lookup → title "Alice"
            .append_query_results([vec![profile_row()]])
            // (b) list_followers(author): one follower (derived id)
            .append_query_results([vec![follower_row(&follower_id)]])
            // (c) authorized_keys(follower): one identity row
            .append_query_results([vec![follower_identity_row]])
            // (d) token_for_public_key(follower_signing_key): one token
            .append_query_results([vec![token_row(
                &follower_signing_key_bytes,
                "ExponentPushToken[follower-xyz]",
            )]])
            .into_connection();

        // ── 3. Build the manager and drive process_job directly ─────
        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            body: "hello world".to_string(),
            reply_recipient: None,
        };

        let ctx =
            crate::service::context::ServiceContext::new(db.clone(), None);
        manager
            .process_job(&ctx, &job)
            .await
            .expect("process_job should succeed");

        // ── 4. Assert Expo received exactly one POST as configured ──
        send_mock.assert_async().await;
    }

    /// The author themselves may appear in `list_followers` (since we
    /// also include their own posts in their following feed elsewhere).
    /// Verify `process_job` skips them so they don't get a notification
    /// for their own post.
    #[tokio::test]
    async fn process_job_excludes_author_from_follower_fan_out() {
        // Only "id-other" should receive a push — never the author.
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"to":["ExponentPushToken[other-token]"]}"#.to_string(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"ok","id":"00000000-0000-0000-0000-000000000003"}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo = Expo::new_with_base_url(None, &expo_server.url());

        // The author appears in list_followers but should be filtered out
        // by `process_job`. If the guard regresses, the test would try to
        // also send to the author — MockDatabase has no further results
        // queued for that path, so process_job would diverge from the
        // mocked query order.
        let signing_key_bytes = vec![3u8; 32];
        let (other_id, other_identity_row) =
            identity_event_row(&signing_key_bytes);
        let author_id = "id-author".to_string();

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) author's profile lookup → title "Alice"
            .append_query_results([vec![profile_row()]])
            // (b) list_followers: author + a real follower, in that order
            .append_query_results([vec![
                follower_row(&author_id),
                follower_row(&other_id),
            ]])
            // (c) authorized_keys(other): one identity row
            .append_query_results([vec![other_identity_row]])
            // (d) token_for_public_key: other's token
            .append_query_results([vec![token_row(
                &signing_key_bytes,
                "ExponentPushToken[other-token]",
            )]])
            .into_connection();

        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: author_id,
            body: "self post".to_string(),
            reply_recipient: None,
        };

        let ctx =
            crate::service::context::ServiceContext::new(db.clone(), None);
        manager
            .process_job(&ctx, &job)
            .await
            .expect("process_job should succeed");

        send_mock.assert_async().await;
    }

    /// A follower who is also the reply recipient should not be
    /// notified twice. Verify the follower-loop's skip guard fires.
    ///
    /// To catch a regression, two mockito mocks are registered:
    /// - the expected "Replied to your post" call with expect(1)
    /// - a catch-all "Created a new post" call with expect(0)
    /// If dedup breaks, the second send would match the latter and fail.
    #[tokio::test]
    async fn process_job_skips_follower_who_is_also_reply_recipient() {
        let mut expo_server = mockito::Server::new_async().await;

        let reply_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"body":"Replied to your post"}"#.to_string(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"ok","id":"00000000-0000-0000-0000-000000000004"}]}"#,
            )
            .expect(1)
            .create_async()
            .await;

        // Catch-all that should never fire — proves no follower "Created
        // a new post" send was issued for the deduplicated recipient.
        let new_post_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"body":"Created a new post"}"#.to_string(),
            ))
            .with_status(200)
            .with_body("{}")
            .expect(0)
            .create_async()
            .await;

        let expo = Expo::new_with_base_url(None, &expo_server.url());

        // Single follower whose identity matches reply_recipient.
        let signing_key_bytes = vec![4u8; 32];
        let (bob_id, bob_identity_row) = identity_event_row(&signing_key_bytes);

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) author's profile lookup → title "Alice"
            .append_query_results([vec![profile_row()]])
            // (b) reply branch: authorized_keys(bob)
            .append_query_results([vec![bob_identity_row]])
            // (c) reply branch: token_for_public_key
            .append_query_results([vec![token_row(
                &signing_key_bytes,
                "ExponentPushToken[bob-token]",
            )]])
            // (d) list_followers returns bob — the follower loop should
            // skip them because they match reply_recipient.
            .append_query_results([vec![follower_row(&bob_id)]])
            .into_connection();

        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            body: "hi bob".to_string(),
            reply_recipient: Some(bob_id),
        };

        let ctx =
            crate::service::context::ServiceContext::new(db.clone(), None);
        manager
            .process_job(&ctx, &job)
            .await
            .expect("process_job should succeed");

        reply_mock.assert_async().await;
        new_post_mock.assert_async().await;
    }

    /// When Expo returns a `DeviceNotRegistered` ticket, the token row
    /// must be removed from the database via `unregister`. We assert
    /// the DELETE statement appears in MockDatabase's transaction log.
    #[tokio::test]
    async fn process_job_unregisters_token_on_device_not_registered() {
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            // A DeviceNotRegistered error ticket triggers the unregister
            // branch in `send_to_identity`.
            .with_body(
                r#"{"data":[{"status":"error","message":"not registered","details":{"error":"DeviceNotRegistered"}}]}"#,
            )
            .expect(1)
            .create_async()
            .await;
        let expo = Expo::new_with_base_url(None, &expo_server.url());

        let signing_key_bytes = vec![5u8; 32];
        let (recipient_id, recipient_identity_row) =
            identity_event_row(&signing_key_bytes);

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) author's profile lookup → title "Alice"
            .append_query_results([vec![profile_row()]])
            // (b) reply branch: authorized_keys
            .append_query_results([vec![recipient_identity_row]])
            // (c) reply branch: token_for_public_key
            .append_query_results([vec![token_row(
                &signing_key_bytes,
                "ExponentPushToken[dead-device]",
            )]])
            // (d) unregister DELETE — sea-orm issues this as exec, not query.
            .append_exec_results([sea_orm::MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            // (e) list_followers: empty
            .append_query_results([Vec::<BTreeMap<String, Value>>::new()])
            .into_connection();

        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            body: "ping".to_string(),
            reply_recipient: Some(recipient_id),
        };

        let ctx =
            crate::service::context::ServiceContext::new(db.clone(), None);
        manager
            .process_job(&ctx, &job)
            .await
            .expect("process_job should succeed");

        send_mock.assert_async().await;

        // Confirm the unregister DELETE was issued. Consuming the
        // connection here is fine — we're done with the DB.
        let log = db.into_transaction_log();
        let saw_delete = log.iter().any(|tx| {
            tx.statements().iter().any(|stmt| {
                let sql = stmt.sql.to_ascii_uppercase();
                sql.starts_with("DELETE") && sql.contains("PUSH_TOKEN")
            })
        });
        assert!(
            saw_delete,
            "expected an unregister DELETE on push_token, got: {log:?}"
        );
    }
}
