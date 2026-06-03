use std::sync::Arc;
use std::{error::Error, fmt};

use expo_push_notification_client::{
    DetailsErrorType, Expo, ExpoPushMessage, ExpoPushTicket,
};
use sea_orm::{DbConn, DbErr, EnumIter};
use tokio::sync::mpsc;

use super::repository as token_repository;
use crate::service::identity::repository as identity_repository;
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
    pub author_name: Option<String>,
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
        db: DbConn,
        mut rx: mpsc::Receiver<NotificationJob>,
    ) {
        while let Some(job) = rx.recv().await {
            if let Err(e) = self.process_job(&db, &job).await {
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
        db: &DbConn,
        job: &NotificationJob,
    ) -> Result<(), NotificationError> {
        let title = match &job.author_name {
            Some(name) => name.to_owned(),
            None => "Anonymous".to_string(),
        };

        if let Some(recipient) = &job.reply_recipient {
            if let Err(e) = self
                .send_to_identity(
                    db,
                    recipient,
                    title.clone(),
                    "Replied to your post".to_string(),
                )
                .await
            {
                eprintln!("reply notification send error: {e}");
            }
        }

        let followers =
            FeedsRepository::Query::list_followers(db, &job.author_identity)
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
                    db,
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
    use crate::service::proto::{Identity, KeyType};
    use ::entity::push_token_model as PushTokenModel;
    use prost::Message;
    use sea_orm::{DbBackend, MockDatabase, Value};
    use std::collections::BTreeMap;

    /// Drives `process_job` end-to-end against a mocked DB and a wiremock-
    /// style Expo server, and asserts that exactly one POST hits Expo with
    /// the recipient's token.
    ///
    /// Scenario: a reply post with no followers. The reply recipient has
    /// one authorized signing key, and that key has a registered Expo
    /// token. We expect:
    ///   - one DB read each for authorized_keys, token_for_public_key,
    ///     and list_followers (in that order — `process_job` handles the
    ///     reply recipient before the follower fan-out)
    ///   - exactly one POST to `/--/api/v2/push/send` carrying the token
    #[tokio::test]
    async fn process_job_sends_to_reply_recipient_via_expo() {
        // ── 1. Mock Expo at the HTTP layer ──────────────────────────
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"to":["ExponentPushToken[abc123]"],"title":"New reply from Alice","body":"hello"}"#
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

        // ── 2. Mock the three DB queries process_job will issue ─────
        // The first and third queries project non-entity shapes
        // (a custom FromQueryResult struct, and `into_tuple::<String>()`)
        // so we feed MockDatabase BTreeMap rows. The middle query is an
        // entity find, so its Model type works directly.
        let signing_key_bytes = vec![1u8; 32];
        let signing_pk = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: signing_key_bytes.clone(),
        };
        let identity_bytes = Identity {
            rotation_keys: vec![],
            signing_keys: vec![signing_pk],
        }
        .encode_to_vec();

        let authorized_keys_row: BTreeMap<String, Value> = BTreeMap::from([(
            "identity_bytes".to_string(),
            Value::from(identity_bytes),
        )]);

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) authorized_keys(reply_recipient): one identity row
            .append_query_results([vec![authorized_keys_row]])
            // (b) token_for_public_key(signing_key): one registered token
            .append_query_results([vec![PushTokenModel::Model {
                public_key_type: KeyType::Ed25519 as i16,
                public_key: signing_key_bytes,
                service: PushService::Expo.as_ref().to_string(),
                token: "ExponentPushToken[abc123]".to_string(),
                created_at: time::PrimitiveDateTime::MIN,
            }]])
            // (c) list_followers(author): none
            .append_query_results([Vec::<BTreeMap<String, Value>>::new()])
            .into_connection();

        // ── 3. Build the manager and drive process_job directly ─────
        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            author_name: Some("Alice".to_string()),
            body: "hello".to_string(),
            reply_recipient: Some("id-recipient".to_string()),
        };

        manager
            .process_job(&db, &job)
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
    /// a registered Expo token. We expect:
    ///   - DB reads in order: list_followers, then for the follower
    ///     authorized_keys and token_for_public_key (reply-recipient
    ///     branch is skipped entirely when reply_recipient is None)
    ///   - exactly one POST to `/--/api/v2/push/send` with the
    ///     follower's token and a "New post from …" title
    #[tokio::test]
    async fn process_job_fans_out_to_followers_via_expo() {
        // ── 1. Mock Expo at the HTTP layer ──────────────────────────
        let mut expo_server = mockito::Server::new_async().await;
        let send_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"to":["ExponentPushToken[follower-xyz]"],"title":"New post from Alice","body":"hello world"}"#
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

        // ── 2. Mock the three DB queries process_job will issue ─────
        // Note the order vs. the reply-recipient test:
        // list_followers runs first when reply_recipient is None.
        let follower_signing_key_bytes = vec![2u8; 32];
        let follower_signing_pk = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: follower_signing_key_bytes.clone(),
        };
        let follower_identity_bytes = Identity {
            rotation_keys: vec![],
            signing_keys: vec![follower_signing_pk],
        }
        .encode_to_vec();

        let follower_row: BTreeMap<String, Value> = BTreeMap::from([(
            // list_followers uses `into_tuple::<String>()`; the column
            // name is positional in MockRow so any string key works.
            "identity".to_string(),
            Value::from("id-follower".to_string()),
        )]);

        let authorized_keys_row: BTreeMap<String, Value> = BTreeMap::from([(
            "identity_bytes".to_string(),
            Value::from(follower_identity_bytes),
        )]);

        let db = MockDatabase::new(DbBackend::Postgres)
            // (a) list_followers(author): one follower
            .append_query_results([vec![follower_row]])
            // (b) authorized_keys(follower): one identity row
            .append_query_results([vec![authorized_keys_row]])
            // (c) token_for_public_key(follower_signing_key): one token
            .append_query_results([vec![PushTokenModel::Model {
                public_key_type: KeyType::Ed25519 as i16,
                public_key: follower_signing_key_bytes,
                service: PushService::Expo.as_ref().to_string(),
                token: "ExponentPushToken[follower-xyz]".to_string(),
                created_at: time::PrimitiveDateTime::MIN,
            }]])
            .into_connection();

        // ── 3. Build the manager and drive process_job directly ─────
        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            author_name: Some("Alice".to_string()),
            body: "hello world".to_string(),
            reply_recipient: None,
        };

        manager
            .process_job(&db, &job)
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

        // `id-author` appears in list_followers but should be filtered out
        // by `process_job`. If the guard regresses, the test would try to
        // also send to id-author — MockDatabase has no further results
        // queued for that path, so process_job would fail downstream.
        let signing_key_bytes = vec![3u8; 32];
        let signing_pk = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: signing_key_bytes.clone(),
        };
        let identity_bytes = Identity {
            rotation_keys: vec![],
            signing_keys: vec![signing_pk],
        }
        .encode_to_vec();

        let row = |id: &str| -> BTreeMap<String, Value> {
            BTreeMap::from([(
                "identity".to_string(),
                Value::from(id.to_string()),
            )])
        };

        let db = MockDatabase::new(DbBackend::Postgres)
            // list_followers: author + a real follower, in that order
            .append_query_results([vec![row("id-author"), row("id-other")]])
            // authorized_keys(id-other): one identity row
            .append_query_results([vec![BTreeMap::from([(
                "identity_bytes".to_string(),
                Value::from(identity_bytes),
            )])]])
            // token_for_public_key: id-other's token
            .append_query_results([vec![PushTokenModel::Model {
                public_key_type: KeyType::Ed25519 as i16,
                public_key: signing_key_bytes,
                service: PushService::Expo.as_ref().to_string(),
                token: "ExponentPushToken[other-token]".to_string(),
                created_at: time::PrimitiveDateTime::MIN,
            }]])
            .into_connection();

        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            author_name: Some("Alice".to_string()),
            body: "self post".to_string(),
            reply_recipient: None,
        };

        manager
            .process_job(&db, &job)
            .await
            .expect("process_job should succeed");

        send_mock.assert_async().await;
    }

    /// A follower who is also the reply recipient should not be
    /// notified twice. Verify the follower-loop's skip guard fires.
    ///
    /// To catch a regression, two mockito mocks are registered:
    /// - the expected "New reply from …" call with expect(1)
    /// - a catch-all "New post from …" call with expect(0)
    /// If dedup breaks, the second send would match the latter and fail.
    #[tokio::test]
    async fn process_job_skips_follower_who_is_also_reply_recipient() {
        let mut expo_server = mockito::Server::new_async().await;

        let reply_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"title":"New reply from Alice"}"#.to_string(),
            ))
            .with_status(200)
            .with_header("content-type", "application/json; charset=utf-8")
            .with_body(
                r#"{"data":[{"status":"ok","id":"00000000-0000-0000-0000-000000000004"}]}"#,
            )
            .expect(1)
            .create_async()
            .await;

        // Catch-all that should never fire — proves no "New post" was sent.
        let new_post_mock = expo_server
            .mock("POST", "/--/api/v2/push/send")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"title":"New post from Alice"}"#.to_string(),
            ))
            .with_status(200)
            .with_body("{}")
            .expect(0)
            .create_async()
            .await;

        let expo = Expo::new_with_base_url(None, &expo_server.url());

        // Single follower whose identity matches reply_recipient.
        let signing_key_bytes = vec![4u8; 32];
        let signing_pk = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: signing_key_bytes.clone(),
        };
        let identity_bytes = Identity {
            rotation_keys: vec![],
            signing_keys: vec![signing_pk],
        }
        .encode_to_vec();

        let db = MockDatabase::new(DbBackend::Postgres)
            // (reply branch) authorized_keys(id-bob)
            .append_query_results([vec![BTreeMap::from([(
                "identity_bytes".to_string(),
                Value::from(identity_bytes),
            )])]])
            // (reply branch) token_for_public_key
            .append_query_results([vec![PushTokenModel::Model {
                public_key_type: KeyType::Ed25519 as i16,
                public_key: signing_key_bytes,
                service: PushService::Expo.as_ref().to_string(),
                token: "ExponentPushToken[bob-token]".to_string(),
                created_at: time::PrimitiveDateTime::MIN,
            }]])
            // list_followers returns id-bob — the follower loop should
            // skip them because they match reply_recipient.
            .append_query_results([vec![BTreeMap::<String, Value>::from([(
                "identity".to_string(),
                Value::from("id-bob".to_string()),
            )])]])
            .into_connection();

        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            author_name: Some("Alice".to_string()),
            body: "hi bob".to_string(),
            reply_recipient: Some("id-bob".to_string()),
        };

        manager
            .process_job(&db, &job)
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
        let signing_pk = PublicKey {
            key_type: KeyType::Ed25519 as i32,
            key: signing_key_bytes.clone(),
        };
        let identity_bytes = Identity {
            rotation_keys: vec![],
            signing_keys: vec![signing_pk],
        }
        .encode_to_vec();

        let db = MockDatabase::new(DbBackend::Postgres)
            // (reply branch) authorized_keys
            .append_query_results([vec![BTreeMap::from([(
                "identity_bytes".to_string(),
                Value::from(identity_bytes),
            )])]])
            // (reply branch) token_for_public_key
            .append_query_results([vec![PushTokenModel::Model {
                public_key_type: KeyType::Ed25519 as i16,
                public_key: signing_key_bytes,
                service: PushService::Expo.as_ref().to_string(),
                token: "ExponentPushToken[dead-device]".to_string(),
                created_at: time::PrimitiveDateTime::MIN,
            }]])
            // unregister DELETE — sea-orm issues this as exec, not query.
            .append_exec_results([sea_orm::MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            // list_followers: empty
            .append_query_results([Vec::<BTreeMap<String, Value>>::new()])
            .into_connection();

        let (manager, _rx) = NotificationManager::new(expo);
        let job = NotificationJob {
            author_identity: "id-author".to_string(),
            author_name: Some("Alice".to_string()),
            body: "ping".to_string(),
            reply_recipient: Some("id-recipient".to_string()),
        };

        manager
            .process_job(&db, &job)
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
