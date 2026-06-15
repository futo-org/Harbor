//! gRPC `ServerService` impl. Each method delegates to a handler
//! under `server/rpc/`.

pub mod get_notifications;

use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use polycentric_common::models::protos_v2::{
    GetNotificationsRequest, GetNotificationsResponse,
    RegisterPushNotificationResponse, SignedMessage,
    UnregisterPushNotificationResponse,
};
use tonic::{Request, Response, Status};

#[derive(Debug)]
pub struct NotificationServiceImpl {}

#[tonic::async_trait]
impl NotificationService for NotificationServiceImpl {
    async fn get_notifications(
        &self,
        request: Request<GetNotificationsRequest>,
    ) -> Result<Response<GetNotificationsResponse>, Status> {
        Ok(Response::new(
            get_notifications::handle(request.into_inner()).await?,
        ))
    }
    async fn register_push_notifications(
        &self,
        _request: Request<SignedMessage>,
    ) -> Result<Response<RegisterPushNotificationResponse>, Status> {
        return Err(Status::not_found(
            "Not implemented here. Use a push service.",
        ));
    }
    async fn unregister_push_notifications(
        &self,
        _request: Request<SignedMessage>,
    ) -> Result<Response<UnregisterPushNotificationResponse>, Status> {
        return Err(Status::not_found(
            "Not implemented here. Use a push service.",
        ));
    }
}

pub fn build_notifications_service()
-> NotificationServiceServer<NotificationServiceImpl> {
    NotificationServiceServer::new(NotificationServiceImpl {})
}
