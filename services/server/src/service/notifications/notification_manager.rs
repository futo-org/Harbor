use std::{collections::HashMap, error::Error, fmt};

use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use polycentric_common::models::protos_v2::PublicKey;
use sea_orm::{DbConn, DbErr, EnumIter};

use super::token_repository;

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
    InvalidToken,
    Database(DbErr),
    PushService(String),
}

impl fmt::Display for NotificationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NotificationError::UnknownService(s) => {
                write!(f, "unknown push service: {s}")
            }
            NotificationError::InvalidToken => write!(f, "invalid push token"),
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
    pub fn new(expo_access_token: Option<String>) -> Self {
        Self {
            expo: Expo::new(ExpoClientOptions {
                access_token: expo_access_token,
            }),
        }
    }

    pub async fn register(
        &self,
        db: &DbConn,
        identity: String,
        service: String,
        token: String,
    ) -> Result<(), NotificationError> {
        self.verify_token(&service, &token).await?;

        token_repository::Mutation::register(db, identity, service, token)
            .await?;

        Ok(())
    }

    pub async fn send(
        &self,
        db: &DbConn,
        identity: &str,
        title: String,
        body: String,
    ) -> Result<(), NotificationError> {
        let rows =
            token_repository::Query::tokens_for_identity(db, identity).await?;

        let expo_tokens: Vec<String> = rows
            .into_iter()
            .filter(|r| r.service == PushService::Expo.as_ref())
            .map(|r| r.token)
            .collect();

        if expo_tokens.is_empty() {
            return Ok(());
        }

        let message = ExpoPushMessage::builder(expo_tokens.clone())
            .title(title)
            .body(body)
            .build()
            .map_err(|e| NotificationError::PushService(e.to_string()))?;

        let _tickets = self
            .expo
            .send_push_notifications(message)
            .await
            .map_err(|e| NotificationError::PushService(e.to_string()))?;

        // TODO: zip tickets with expo_tokens; on DeviceNotRegistered,
        // call token_repository::Mutation::unregister to clean up.
        // Also defer ticket IDs for later get_push_notification_receipts polling.

        Ok(())
    }

    async fn verify_token(
        &self,
        service: &str,
        _token: &str,
    ) -> Result<(), NotificationError> {
        if service != PushService::Expo.as_ref() {
            Err(NotificationError::UnknownService(service.to_string()))
        } else {
            Ok(())
        }
    }
}
