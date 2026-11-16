//! gRPC `NotificationService` impl. Each method delegates to a
//! handler under `notifications/rpc/`.

pub mod register_push_notifications;

use crate::context::Context;
use polycentric_common::models::protos_v2::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use polycentric_common::models::protos_v2::{
    AcknowledgeNotificationsRequest, AcknowledgeNotificationsResponse, ListNotificationsRequest,
    ListNotificationsResponse, RegisterPushNotificationRequest, RegisterPushNotificationResponse,
    SubscribeUnreadNotificationCountRequest, SubscribeUnreadNotificationCountResponse,
};
use std::sync::Arc;
use tonic::codegen::BoxStream;
use tonic::{Request, Response, Status};

#[derive(Clone)]
pub struct NotificationServiceImpl {
    ctx: Arc<Context>,
}

#[tonic::async_trait]
impl NotificationService for NotificationServiceImpl {
    async fn list_notifications(
        &self,
        _request: Request<ListNotificationsRequest>,
    ) -> Result<Response<ListNotificationsResponse>, Status> {
        // The notification feed is served by the main server, not the push
        // service.
        Err(Status::not_found(
            "Not implemented here. Use the main server.",
        ))
    }

    async fn acknowledge_notifications(
        &self,
        _request: Request<AcknowledgeNotificationsRequest>,
    ) -> Result<Response<AcknowledgeNotificationsResponse>, Status> {
        Err(Status::not_found(
            "Not implemented here. Use the main server.",
        ))
    }

    type SubscribeUnreadNotificationCountStream =
        BoxStream<SubscribeUnreadNotificationCountResponse>;
    async fn subscribe_unread_notification_count(
        &self,
        _request: Request<SubscribeUnreadNotificationCountRequest>,
    ) -> Result<Response<Self::SubscribeUnreadNotificationCountStream>, Status> {
        Err(Status::not_found(
            "Not implemented here. Use the main server.",
        ))
    }

    async fn register_push_notifications(
        &self,
        request: Request<RegisterPushNotificationRequest>,
    ) -> Result<Response<RegisterPushNotificationResponse>, Status> {
        Ok(Response::new(
            register_push_notifications::handle(&self.ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_notification_service(
    ctx: Arc<Context>,
) -> NotificationServiceServer<NotificationServiceImpl> {
    NotificationServiceServer::new(NotificationServiceImpl { ctx })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manager::{NotificationManager, PushService};
    use crate::polycentric::PolycentricClient;
    use crate::rpc::register_push_notifications::MAX_SUBSCRIPTIONS;
    use ed25519_dalek::{Signer, SigningKey};
    use polycentric_common::models::protos_v2::{KeyType, PublicKey, PushSubscription, PushTarget};
    use prost::Message;
    use sea_orm::{DatabaseConnection, DbBackend, MockDatabase, MockExecResult};
    use tonic::Code;

    const TOKEN: &str = "ExponentPushToken[abc123]";

    fn service_with_db(db: DatabaseConnection) -> NotificationServiceImpl {
        NotificationServiceImpl {
            ctx: Arc::new(Context {
                db: db.clone(),
                ro_db: db,
                notification_manager: NotificationManager::new(None),
                polycentric: PolycentricClient::new(vec![]),
                main_server: String::new(),
            }),
        }
    }

    /// A service whose database errors on any use, for requests that should
    /// be rejected before touching it.
    fn service() -> NotificationServiceImpl {
        service_with_db(MockDatabase::new(DbBackend::Postgres).into_connection())
    }

    fn target(token: &str) -> PushTarget {
        PushTarget {
            service: PushService::Expo.as_ref().to_string(),
            token: token.to_string(),
        }
    }

    fn signer(key: &SigningKey) -> PublicKey {
        PublicKey {
            key_type: KeyType::Ed25519.into(),
            key: key.verifying_key().to_bytes().to_vec(),
        }
    }

    fn subscribe(key: &SigningKey, target: &PushTarget, identity: &str) -> PushSubscription {
        let push_target_bytes = target.encode_to_vec();
        PushSubscription {
            signature: key.sign(&push_target_bytes).to_bytes().to_vec(),
            push_target_bytes,
            signer: Some(signer(key)),
            identity: identity.to_string(),
        }
    }

    fn request(
        push_target: Option<PushTarget>,
        subscriptions: Vec<PushSubscription>,
    ) -> Request<RegisterPushNotificationRequest> {
        Request::new(RegisterPushNotificationRequest {
            subscriptions,
            push_target,
        })
    }

    async fn rejection(req: Request<RegisterPushNotificationRequest>) -> Code {
        service()
            .register_push_notifications(req)
            .await
            .expect_err("expected the request to be rejected")
            .code()
    }

    fn key(byte: u8) -> SigningKey {
        SigningKey::from_bytes(&[byte; 32])
    }

    #[tokio::test]
    async fn rejects_missing_target() {
        let sub = subscribe(&key(1), &target(TOKEN), "id-a");
        assert_eq!(
            rejection(request(None, vec![sub])).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_too_many_subscriptions() {
        let t = target(TOKEN);
        let subs = (0..=MAX_SUBSCRIPTIONS)
            .map(|i| subscribe(&key(1), &t, &format!("id-{i}")))
            .collect();
        assert_eq!(
            rejection(request(Some(t), subs)).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_unsupported_service() {
        let t = PushTarget {
            service: "apns".to_string(),
            token: TOKEN.to_string(),
        };
        let sub = subscribe(&key(1), &t, "id-a");
        assert_eq!(
            rejection(request(Some(t), vec![sub])).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_bad_signature() {
        let t = target(TOKEN);
        let mut sub = subscribe(&key(1), &t, "id-a");
        sub.signature[0] ^= 0xff;
        assert_eq!(
            rejection(request(Some(t), vec![sub])).await,
            Code::Unauthenticated
        );
    }

    #[tokio::test]
    async fn rejects_missing_signer() {
        let t = target(TOKEN);
        let mut sub = subscribe(&key(1), &t, "id-a");
        sub.signer = None;
        assert_eq!(
            rejection(request(Some(t), vec![sub])).await,
            Code::Unauthenticated
        );
    }

    #[tokio::test]
    async fn rejects_undecodable_target_bytes() {
        let k = key(1);
        // Field 1 specified with a length of 5 bytes but only 1 given.
        let bytes = vec![0x0a, 0x05, b'a'];
        let sub = PushSubscription {
            signature: k.sign(&bytes).to_bytes().to_vec(),
            push_target_bytes: bytes,
            signer: Some(signer(&k)),
            identity: "id-a".to_string(),
        };
        assert_eq!(
            rejection(request(Some(target(TOKEN)), vec![sub])).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_mismatched_target() {
        let sub = subscribe(&key(1), &target("ExponentPushToken[other]"), "id-a");
        assert_eq!(
            rejection(request(Some(target(TOKEN)), vec![sub])).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_duplicate_signer_and_identity() {
        let t = target(TOKEN);
        let subs = vec![
            subscribe(&key(1), &t, "id-a"),
            subscribe(&key(1), &t, "id-a"),
        ];
        assert_eq!(
            rejection(request(Some(t), subs)).await,
            Code::InvalidArgument
        );
    }

    /// Two subscriptions: the target's rows and the signers' rows are wiped,
    /// then the new rows are inserted, all in one transaction.
    #[tokio::test]
    async fn registers_subscriptions_in_one_transaction() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_exec_results([
                MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                },
                MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                },
                MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 2,
                },
            ])
            .into_connection();
        let svc = service_with_db(db.clone());

        let t = target(TOKEN);
        let subs = vec![
            subscribe(&key(1), &t, "id-a"),
            subscribe(&key(2), &t, "id-b"),
        ];
        svc.register_push_notifications(request(Some(t), subs))
            .await
            .expect("expected registration to succeed");

        drop(svc);
        let log = db.into_transaction_log();
        assert_eq!(log.len(), 1, "expected one transaction: {log:?}");
        let sql = format!("{:?}", log[0]);
        assert!(sql.contains("BEGIN"), "{sql}");
        assert_eq!(
            sql.matches("DELETE FROM \\\"push_token\\\"").count(),
            2,
            "{sql}"
        );
        assert!(sql.contains("INSERT INTO \\\"push_token\\\""), "{sql}");
        assert!(sql.contains("COMMIT"), "{sql}");
    }

    /// No subscriptions: only the target's rows are removed.
    #[tokio::test]
    async fn empty_subscriptions_remove_the_target() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 3,
            }])
            .into_connection();
        let svc = service_with_db(db.clone());

        svc.register_push_notifications(request(Some(target(TOKEN)), vec![]))
            .await
            .expect("expected unregistration to succeed");

        drop(svc);
        let sql = format!("{:?}", db.into_transaction_log());
        assert_eq!(
            sql.matches("DELETE FROM \\\"push_token\\\"").count(),
            1,
            "{sql}"
        );
        assert!(!sql.contains("INSERT"), "{sql}");
    }
}
