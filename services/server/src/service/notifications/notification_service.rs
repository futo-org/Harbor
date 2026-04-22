use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use crate::service::proto::{RegisterPushNotificationResponse, SignedMessage};
use crate::util;
use polycentric_common::models::protos_v2::RegisterPushNotificationRequest;
use prost::Message;
use tonic::{Request, Response, Status};

#[derive(Debug)]
pub struct NotificationServiceImpl {
    #[allow(dead_code)]
    db: sea_orm::DatabaseConnection,
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
        .map_err(|e| {
            Status::invalid_argument(
                "Argument is not a RegisterPushNotificationRequest",
            )
        })?;

        Err(Status::unimplemented("register_push_notifications"))
    }
}

pub fn build_notification_service(
    db: sea_orm::DatabaseConnection,
) -> NotificationServiceServer<NotificationServiceImpl> {
    NotificationServiceServer::new(NotificationServiceImpl { db })
}
