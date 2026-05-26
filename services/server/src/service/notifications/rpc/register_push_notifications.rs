//! `register_push_notifications`: persist a push token for the
//! authenticated public key. Verifies the signed envelope, decodes
//! the inner request body, then hands off to the notification
//! manager. Mutation — no pipeline.

use crate::service::notifications::manager::NotificationManager;
use crate::service::proto::{RegisterPushNotificationResponse, SignedMessage};
use crate::util;
use polycentric_common::models::protos_v2::RegisterPushNotificationRequest;
use prost::Message;
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    notification_manager: &Arc<NotificationManager>,
    signed_message: SignedMessage,
) -> Result<RegisterPushNotificationResponse, Status> {
    let public_key = signed_message.public_key.ok_or_else(|| {
        Status::invalid_argument("SignedMessage missing public_key")
    })?;

    util::signing::verify_signature(
        &public_key.key,
        &signed_message.signature[..],
        &signed_message.message_bytes[..],
    )
    .map_err(|e| Status::unauthenticated(e.to_string()))?;

    let request = RegisterPushNotificationRequest::decode(
        &signed_message.message_bytes[..],
    )
    .map_err(|_| {
        Status::invalid_argument(
            "Argument is not a RegisterPushNotificationRequest",
        )
    })?;

    notification_manager
        .register(db, &public_key, request.service, request.token)
        .await
        .map_err(|err| Status::unknown(err.to_string()))?;

    Ok(RegisterPushNotificationResponse {})
}
