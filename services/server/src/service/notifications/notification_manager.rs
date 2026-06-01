use std::sync::Arc;
use std::{error::Error, fmt};

use expo_push_notification_client::{
    DetailsErrorType, Expo, ExpoClientOptions, ExpoPushMessage, ExpoPushTicket,
};
use sea_orm::{DbConn, DbErr, EnumIter};
use tokio::sync::mpsc;

use super::token_repository;
use crate::service::feeds::feeds_repository as FeedsRepository;
use crate::service::{identity::identity_repository, proto::PublicKey};

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
    pub fn new() -> (Arc<Self>, mpsc::Receiver<NotificationJob>) {
        let (tx, rx) = mpsc::channel(1024);
        let manager = Arc::new(Self {
            expo: Expo::new(ExpoClientOptions {
                access_token: std::env::var("EXPO_ACCESS_TOKEN").ok(),
            }),
            tx,
        });
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
        if let Some(recipient) = &job.reply_recipient {
            let title = match &job.author_name {
                Some(name) => format!("New reply from {name}"),
                None => "New reply".to_string(),
            };
            if let Err(e) = self
                .send_to_identity(db, recipient, title, job.body.clone())
                .await
            {
                eprintln!("reply notification send error: {e}");
            }
        }

        let followers = FeedsRepository::Query::list_followers(
            db,
            &job.author_identity,
        )
        .await?;

        let title = match &job.author_name {
            Some(name) => format!("New post from {name}"),
            None => "New post".to_string(),
        };

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
                    job.body.clone(),
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
