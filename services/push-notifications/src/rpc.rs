//! gRPC `NotificationService` impl. Each method delegates to a
//! handler under `notifications/rpc/`.

pub mod set_device_push_subscriptions;

use crate::context::Context;
use polycentric_common::models::protos_v2::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use polycentric_common::models::protos_v2::{
    AcknowledgeNotificationsRequest, AcknowledgeNotificationsResponse, ListNotificationsRequest,
    ListNotificationsResponse, SetDevicePushSubscriptionsRequest,
    SetDevicePushSubscriptionsResponse, SubscribeUnreadNotificationCountRequest,
    SubscribeUnreadNotificationCountResponse,
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

    async fn set_device_push_subscriptions(
        &self,
        request: Request<SetDevicePushSubscriptionsRequest>,
    ) -> Result<Response<SetDevicePushSubscriptionsResponse>, Status> {
        Ok(Response::new(
            set_device_push_subscriptions::handle(&self.ctx, request.into_inner()).await?,
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
    use crate::rpc::set_device_push_subscriptions::MAX_SUBSCRIPTIONS;
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use ed25519_dalek::{Signer, SigningKey};
    use polycentric_common::models::protos_v2::{AuthenticatedPushSource, PushTarget};
    use sea_orm::{DatabaseConnection, DbBackend, MockDatabase, MockExecResult};
    use tonic::Code;

    const TOKEN: &str = "ExponentPushToken[abc123]";
    const AUDIENCE: &str = "http://localhost:3001";

    fn service_with_db(db: DatabaseConnection) -> NotificationServiceImpl {
        NotificationServiceImpl {
            ctx: Arc::new(Context {
                db: db.clone(),
                ro_db: db,
                notification_manager: NotificationManager::new(None),
                polycentric: PolycentricClient::new(vec![]),
                main_server: String::new(),
                allow_hosts: vec![AUDIENCE.to_string()],
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

    fn now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    /// Mint a token matching js-core's `createServerJwt` format.
    fn mint(key: &SigningKey, iss: &str, aud: &str, exp: u64) -> String {
        let kid = hex::encode(key.verifying_key().to_bytes());
        let header = format!(r#"{{"alg":"EdDSA","typ":"JWT","kid":"{kid}"}}"#);
        let claims = format!(r#"{{"iss":"{iss}","aud":"{aud}","iat":0,"exp":{exp}}}"#);
        let signing_input = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(header),
            URL_SAFE_NO_PAD.encode(claims)
        );
        let signature = key.sign(signing_input.as_bytes());
        format!(
            "{signing_input}.{}",
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        )
    }

    fn source(jwt: String) -> AuthenticatedPushSource {
        AuthenticatedPushSource { jwt }
    }

    /// A valid subscription for `identity`, signed by `key`.
    fn subscribe(key: &SigningKey, identity: &str) -> AuthenticatedPushSource {
        source(mint(key, identity, AUDIENCE, now() + 300))
    }

    fn request(
        push_target: Option<PushTarget>,
        subscriptions: Vec<AuthenticatedPushSource>,
    ) -> Request<SetDevicePushSubscriptionsRequest> {
        Request::new(SetDevicePushSubscriptionsRequest {
            push_target,
            subscriptions,
        })
    }

    async fn rejection(req: Request<SetDevicePushSubscriptionsRequest>) -> Code {
        service()
            .set_device_push_subscriptions(req)
            .await
            .expect_err("expected the request to be rejected")
            .code()
    }

    fn key(byte: u8) -> SigningKey {
        SigningKey::from_bytes(&[byte; 32])
    }

    #[tokio::test]
    async fn rejects_missing_target() {
        let sub = subscribe(&key(1), "id-a");
        assert_eq!(
            rejection(request(None, vec![sub])).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_too_many_subscriptions() {
        let subs = (0..=MAX_SUBSCRIPTIONS)
            .map(|i| subscribe(&key(1), &format!("id-{i}")))
            .collect();
        assert_eq!(
            rejection(request(Some(target(TOKEN)), subs)).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_unsupported_service() {
        let t = PushTarget {
            service: "apns".to_string(),
            token: TOKEN.to_string(),
        };
        let sub = subscribe(&key(1), "id-a");
        assert_eq!(
            rejection(request(Some(t), vec![sub])).await,
            Code::InvalidArgument
        );
    }

    #[tokio::test]
    async fn rejects_bad_signature() {
        let mut jwt = mint(&key(1), "id-a", AUDIENCE, now() + 300);
        // Swap the signature for one from a different key.
        let other = mint(&key(2), "id-a", AUDIENCE, now() + 300);
        jwt.truncate(jwt.rfind('.').unwrap());
        jwt.push_str(&other[other.rfind('.').unwrap()..]);
        assert_eq!(
            rejection(request(Some(target(TOKEN)), vec![source(jwt)])).await,
            Code::Unauthenticated
        );
    }

    #[tokio::test]
    async fn rejects_wrong_audience() {
        let jwt = mint(&key(1), "id-a", "https://elsewhere.example", now() + 300);
        assert_eq!(
            rejection(request(Some(target(TOKEN)), vec![source(jwt)])).await,
            Code::Unauthenticated
        );
    }

    #[tokio::test]
    async fn rejects_expired_token() {
        let jwt = mint(&key(1), "id-a", AUDIENCE, now() - 1);
        assert_eq!(
            rejection(request(Some(target(TOKEN)), vec![source(jwt)])).await,
            Code::Unauthenticated
        );
    }

    #[tokio::test]
    async fn rejects_malformed_token() {
        let jwt = "not-a-jwt".to_string();
        assert_eq!(
            rejection(request(Some(target(TOKEN)), vec![source(jwt)])).await,
            Code::Unauthenticated
        );
    }

    #[tokio::test]
    async fn rejects_duplicate_signer_and_identity() {
        let subs = vec![subscribe(&key(1), "id-a"), subscribe(&key(1), "id-a")];
        assert_eq!(
            rejection(request(Some(target(TOKEN)), subs)).await,
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

        let subs = vec![subscribe(&key(1), "id-a"), subscribe(&key(2), "id-b")];
        svc.set_device_push_subscriptions(request(Some(target(TOKEN)), subs))
            .await
            .expect("expected registration to succeed");

        drop(svc);
        let log = db.into_transaction_log();
        assert_eq!(log.len(), 1, "expected one transaction: {log:?}");
        let sql = format!("{:?}", log[0]);
        assert!(sql.contains("BEGIN"), "{sql}");
        assert_eq!(
            sql.matches("DELETE FROM \\\"push_subscription\\\"").count(),
            2,
            "{sql}"
        );
        assert!(
            sql.contains("INSERT INTO \\\"push_subscription\\\""),
            "{sql}"
        );
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

        svc.set_device_push_subscriptions(request(Some(target(TOKEN)), vec![]))
            .await
            .expect("expected unregistration to succeed");

        drop(svc);
        let sql = format!("{:?}", db.into_transaction_log());
        assert_eq!(
            sql.matches("DELETE FROM \\\"push_subscription\\\"").count(),
            1,
            "{sql}"
        );
        assert!(!sql.contains("INSERT"), "{sql}");
    }
}
