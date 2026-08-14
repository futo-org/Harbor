//! gRPC `ServerService` impl. Each method delegates to a handler
//! under `server/rpc/`.

pub mod list_notifications;

use std::sync::Arc;

use crate::service::context::ServiceContext;
use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use polycentric_common::models::protos_v2::{
    ListNotificationsRequest, ListNotificationsResponse,
    RegisterPushNotificationResponse, SignedMessage,
    UnregisterPushNotificationResponse,
};
use tonic::{Request, Response, Status};

pub struct NotificationServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl NotificationService for NotificationServiceImpl {
    async fn list_notifications(
        &self,
        request: Request<ListNotificationsRequest>,
    ) -> Result<Response<ListNotificationsResponse>, Status> {
        Ok(Response::new(
            list_notifications::handle(&self.ctx, request.into_inner()).await?,
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

pub fn build_notifications_service(
    ctx: Arc<ServiceContext>,
) -> NotificationServiceServer<NotificationServiceImpl> {
    NotificationServiceServer::new(NotificationServiceImpl { ctx })
}
