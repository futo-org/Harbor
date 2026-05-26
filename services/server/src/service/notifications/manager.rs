use std::{error::Error, fmt};

use expo_push_notification_client::{
    DetailsErrorType, Expo, ExpoClientOptions, ExpoPushMessage, ExpoPushTicket,
};
use sea_orm::{DbConn, DbErr, EnumIter};

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

pub struct NotificationManager {
    expo: Expo,
}

impl NotificationManager {
    pub fn new() -> Self {
        Self {
            expo: Expo::new(ExpoClientOptions {
                access_token: std::env::var("EXPO_ACCESS_TOKEN").ok(),
            }),
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

        token_repository::Mutation::register(db, public_key, service, token)
            .await?;

        Ok(())
    }

    /// Sends a push notification to every authorized key of an identity that
    /// has a registered token. Tokens reported as invalid by the push service
    /// are unregistered as part of the send.
    #[allow(dead_code)] // TODO remove this once the notification manager is used
    pub async fn send(
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
