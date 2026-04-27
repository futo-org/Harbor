use std::sync::Arc;

use crate::service::identity::identity_repository;
use crate::service::notifications::notification_manager::NotificationManager;
use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use crate::service::proto::{RegisterPushNotificationResponse, SignedMessage};
use crate::util;
use polycentric_common::models::protos_v2::RegisterPushNotificationRequest;
use prost::Message;
use tonic::{Request, Response, Status};

pub struct NotificationServiceImpl {
    db: sea_orm::DatabaseConnection,
    notification_manager: Arc<NotificationManager>,
}

#[tonic::async_trait]
impl NotificationService for NotificationServiceImpl {
    async fn register_push_notifications(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<RegisterPushNotificationResponse>, Status> {
        let signed_message = request.into_inner();

        let signed_by = signed_message.signed_by.ok_or_else(|| {
            Status::invalid_argument("SignedMessage missing signed_by")
        })?;

        // Validate the SignedMessage
        util::signing::verify_signature(
            &signed_by.key,
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

        let identity_result =
            identity_repository::Query::identity_for_public_key(
                &self.db, &signed_by,
            )
            .await;

        let identity = match identity_result {
            Ok(Some(id)) => Ok(id),
            _ => Err(Status::invalid_argument(
                "No valid identity found for provided PublicKey",
            )),
        }?;

        self.notification_manager
            .register(&self.db, identity, request.service, request.token)
            .await
            .map_err(|err| Status::unknown(err.to_string()))?;

        Ok(RegisterPushNotificationResponse {}.into())
    }
}

pub fn build_notification_service(
    db: sea_orm::DatabaseConnection,
    notification_manager: Arc<NotificationManager>,
) -> NotificationServiceServer<NotificationServiceImpl> {
    NotificationServiceServer::new(NotificationServiceImpl {
        db,
        notification_manager,
    })
}
