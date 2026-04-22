use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use crate::service::proto::{
    RegisterPushNotificationResponse, SignedMessage,
};
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
        _request: Request<SignedMessage>,
    ) -> Result<Response<RegisterPushNotificationResponse>, Status> {
        // TODO: verify signature on SignedMessage using signed_by PublicKey,
        // decode message_bytes as RegisterPushNotificationRequest, and persist
        // (identity, service, token) to a push_notification_registration table.
        Err(Status::unimplemented("register_push_notifications"))
    }
}

pub fn build_notification_service(
    db: sea_orm::DatabaseConnection,
) -> NotificationServiceServer<NotificationServiceImpl> {
    NotificationServiceServer::new(NotificationServiceImpl { db })
}
