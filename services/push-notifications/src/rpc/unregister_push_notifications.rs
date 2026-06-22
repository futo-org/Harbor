//! `unregister_push_notifications`: remove a previously-registered push
//! token for the authenticated public key. Verifies the signed envelope
//! and decodes the inner request body, mirroring
//! `register_push_notifications`.

use crate::manager::NotificationManager;
use polycentric_common::models::protos_v2::UnregisterPushNotificationRequest;
use polycentric_common::models::protos_v2::{SignedMessage, UnregisterPushNotificationResponse};
use polycentric_common::signing::verify_signature;
use prost::Message;
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    notification_manager: &NotificationManager,
    signed_message: SignedMessage,
) -> Result<UnregisterPushNotificationResponse, Status> {
    let public_key = signed_message
        .public_key
        .ok_or_else(|| Status::invalid_argument("SignedMessage missing public_key"))?;

    verify_signature(
        &public_key.key,
        &signed_message.signature[..],
        &signed_message.message_bytes[..],
    )
    .map_err(|e| Status::unauthenticated(e.to_string()))?;

    let request = UnregisterPushNotificationRequest::decode(&signed_message.message_bytes[..])
        .map_err(|_| {
            Status::invalid_argument("Argument is not an UnregisterPushNotificationRequest")
        })?;

    notification_manager
        .unregister(db, &public_key, &request.service, &request.token)
        .await
        .map_err(|err| Status::unknown(err.to_string()))?;

    Ok(UnregisterPushNotificationResponse {})
}
