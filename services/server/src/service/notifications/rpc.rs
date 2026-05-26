//! gRPC `NotificationService` impl. Each method delegates to a
//! handler under `notifications/rpc/`.

pub mod register_push_notifications;

use crate::service::notifications::manager::NotificationManager;
use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use crate::service::proto::{RegisterPushNotificationResponse, SignedMessage};
use std::sync::Arc;
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
        Ok(Response::new(
            register_push_notifications::handle(
                &self.db,
                &self.notification_manager,
                request.into_inner(),
            )
            .await?,
        ))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::notifications::manager::PushService;
    use crate::service::proto::{KeyType, PublicKey};
    use ::entity::push_token_model as PushTokenModel;
    use ed25519_dalek::{Signer, SigningKey};
    use polycentric_common::models::protos_v2::RegisterPushNotificationRequest;
    use prost::Message;
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    async fn impl_for_testing() -> NotificationServiceImpl {
        NotificationServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres).into_connection(),
            notification_manager: Arc::new(NotificationManager::new()),
        }
    }

    #[tokio::test]
    async fn register_rejects_signed_message_without_public_key() {
        let service = impl_for_testing().await;

        let request = Request::new(SignedMessage {
            public_key: None,
            signature: vec![],
            message_bytes: vec![],
        });

        let status = service
            .register_push_notifications(request)
            .await
            .expect_err("expected an error for missing public_key");

        assert_eq!(status.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn register_rejects_signed_message_with_invalid_signature() {
        let service = impl_for_testing().await;

        let signing_key = SigningKey::from_bytes(&[7u8; 32]);

        let message_bytes = RegisterPushNotificationRequest {
            service: PushService::Expo.as_ref().to_string(),
            token: "ExponentPushToken[abc123]".to_string(),
        }
        .encode_to_vec();

        let mut signature =
            signing_key.sign(&message_bytes).to_bytes().to_vec();
        // Corrupt the signature so verification fails despite the body being valid.
        signature[0] ^= 0xff;

        let request = Request::new(SignedMessage {
            public_key: Some(PublicKey {
                key_type: KeyType::Ed25519.into(),
                key: signing_key.verifying_key().to_bytes().to_vec(),
            }),
            signature,
            message_bytes,
        });

        let status = service
            .register_push_notifications(request)
            .await
            .expect_err("expected an error for invalid signature");

        assert_eq!(status.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn register_succeeds_with_valid_signed_message_and_token() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let public_key_bytes = signing_key.verifying_key().to_bytes().to_vec();

        let now = time::OffsetDateTime::now_utc();
        let synced_at = time::PrimitiveDateTime::new(now.date(), now.time());
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![PushTokenModel::Model {
                public_key_type: KeyType::Ed25519 as i16,
                public_key: public_key_bytes.clone(),
                service: PushService::Expo.as_ref().to_string(),
                token: "ExponentPushToken[abc123]".to_string(),
                created_at: synced_at,
            }]])
            .into_connection();

        let service = NotificationServiceImpl {
            db,
            notification_manager: Arc::new(NotificationManager::new()),
        };

        let message_bytes = RegisterPushNotificationRequest {
            service: PushService::Expo.as_ref().to_string(),
            token: "ExponentPushToken[abc123]".to_string(),
        }
        .encode_to_vec();

        let signature = signing_key.sign(&message_bytes);

        let request = Request::new(SignedMessage {
            public_key: Some(PublicKey {
                key_type: KeyType::Ed25519.into(),
                key: public_key_bytes,
            }),
            signature: signature.to_bytes().to_vec(),
            message_bytes,
        });

        service
            .register_push_notifications(request)
            .await
            .expect("expected registration to succeed");
    }

    #[tokio::test]
    async fn register_rejects_unknown_service_identifier() {
        let service = impl_for_testing().await;

        let signing_key = SigningKey::from_bytes(&[7u8; 32]);

        let message_bytes = RegisterPushNotificationRequest {
            service: "not-a-real-service".to_string(),
            token: "some-token".to_string(),
        }
        .encode_to_vec();

        let signature = signing_key.sign(&message_bytes);

        let request = Request::new(SignedMessage {
            public_key: Some(PublicKey {
                key_type: KeyType::Ed25519.into(),
                key: signing_key.verifying_key().to_bytes().to_vec(),
            }),
            signature: signature.to_bytes().to_vec(),
            message_bytes,
        });

        let status = service
            .register_push_notifications(request)
            .await
            .expect_err("expected an error for unknown service identifier");

        assert_eq!(status.code(), Code::Unknown);
    }

    #[tokio::test]
    async fn register_rejects_signed_message_with_undecodable_body() {
        let service = impl_for_testing().await;

        let signing_key = SigningKey::from_bytes(&[7u8; 32]);

        // Wire type 7 is reserved, so this byte never decodes as a valid
        // protobuf message.
        let message_bytes = vec![0xffu8];
        let signature = signing_key.sign(&message_bytes);

        let request = Request::new(SignedMessage {
            public_key: Some(PublicKey {
                key_type: KeyType::Ed25519.into(),
                key: signing_key.verifying_key().to_bytes().to_vec(),
            }),
            signature: signature.to_bytes().to_vec(),
            message_bytes,
        });

        let status = service
            .register_push_notifications(request)
            .await
            .expect_err("expected an error for undecodable body");

        assert_eq!(status.code(), Code::InvalidArgument);
    }
}
