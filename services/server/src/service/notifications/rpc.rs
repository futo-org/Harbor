//! gRPC `ServerService` impl. Each method delegates to a handler
//! under `server/rpc/`.

pub mod acknowledge_notifications;
pub mod list_notifications;
pub mod subscribe_unread_notification_count;

use std::sync::Arc;

use crate::service::auth::authenticated_identity;
use crate::service::context::{RequestContext, ServiceContext};
use crate::service::notifications::changes;
use crate::service::proto::notification_service_server::{
    NotificationService, NotificationServiceServer,
};
use polycentric_common::models::protos_v2::{
    AcknowledgeNotificationsRequest, AcknowledgeNotificationsResponse,
    ListNotificationsRequest, ListNotificationsResponse,
    RegisterPushNotificationResponse, SignedMessage,
    SubscribeUnreadNotificationCountRequest,
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
        let caller = authenticated_identity(&request);
        let ctx = RequestContext::new(&self.ctx, caller.as_deref());
        Ok(Response::new(
            list_notifications::handle(&ctx, request.into_inner()).await?,
        ))
    }
    async fn acknowledge_notifications(
        &self,
        request: Request<AcknowledgeNotificationsRequest>,
    ) -> Result<Response<AcknowledgeNotificationsResponse>, Status> {
        Ok(Response::new(
            acknowledge_notifications::handle(&self.ctx, request).await?,
        ))
    }
    type SubscribeUnreadNotificationCountStream =
        subscribe_unread_notification_count::CountStream;
    async fn subscribe_unread_notification_count(
        &self,
        request: Request<SubscribeUnreadNotificationCountRequest>,
    ) -> Result<Response<Self::SubscribeUnreadNotificationCountStream>, Status>
    {
        Ok(Response::new(
            subscribe_unread_notification_count::handle(
                self.ctx.clone(),
                request,
                changes::subscribe(),
            )
            .await?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::auth::AuthenticatedIdentity;
    use entity::notification_read_marker;
    use sea_orm::{DbBackend, MockDatabase, MockExecResult, Value};
    use std::collections::BTreeMap;
    use std::time::{Duration, Instant};
    use tokio::sync::broadcast;
    use tokio::time::timeout;
    use tokio_stream::StreamExt;
    use tonic::Code;

    fn id_row(id: i64) -> BTreeMap<&'static str, Value> {
        BTreeMap::from([("id", Value::BigInt(Some(id)))])
    }

    async fn ctx(db: sea_orm::DatabaseConnection) -> Arc<ServiceContext> {
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        ServiceContext::new(db.clone(), db, kafka_producer)
    }

    fn authed<T>(message: T, identity: &str) -> Request<T> {
        let mut request = Request::new(message);
        request
            .extensions_mut()
            .insert(AuthenticatedIdentity(identity.to_string()));
        request
    }

    #[tokio::test]
    async fn acknowledge_rejects_unauthenticated() {
        let ctx =
            ctx(MockDatabase::new(DbBackend::Postgres).into_connection()).await;
        let err = acknowledge_notifications::handle(
            &ctx,
            Request::new(AcknowledgeNotificationsRequest {}),
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn acknowledge_moves_the_marker() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![id_row(9)]])
            // The marker upsert, then the change notify.
            .append_exec_results([exec_ok(), exec_ok()])
            .into_connection();
        let ctx = ctx(db).await;
        acknowledge_notifications::handle(
            &ctx,
            authed(AcknowledgeNotificationsRequest {}, "bob"),
        )
        .await
        .unwrap();
    }

    fn exec_ok() -> MockExecResult {
        MockExecResult {
            last_insert_id: 0,
            rows_affected: 1,
        }
    }

    /// A mock that answers one unread count per entry of `counts`: the
    /// marker lookup (none) followed by that many ids.
    fn db_counting(counts: &[i64]) -> MockDatabase {
        let mut db = MockDatabase::new(DbBackend::Postgres);
        for &count in counts {
            db = db
                .append_query_results([
                    Vec::<notification_read_marker::Model>::new(),
                ])
                .append_query_results([(1..=count)
                    .map(id_row)
                    .collect::<Vec<_>>()]);
        }
        db
    }

    async fn subscribe(
        db: MockDatabase,
        identity: &str,
        changes: Option<broadcast::Receiver<String>>,
    ) -> subscribe_unread_notification_count::CountStream {
        subscribe_unread_notification_count::handle(
            ctx(db.into_connection()).await,
            authed(SubscribeUnreadNotificationCountRequest {}, identity),
            changes,
        )
        .await
        .unwrap()
    }

    async fn next_count(
        stream: &mut subscribe_unread_notification_count::CountStream,
    ) -> u32 {
        timeout(Duration::from_secs(2), stream.next())
            .await
            .expect("stream sent nothing")
            .expect("stream ended")
            .unwrap()
            .count
    }

    async fn assert_silent(
        stream: &mut subscribe_unread_notification_count::CountStream,
    ) {
        assert!(
            timeout(Duration::from_millis(200), stream.next())
                .await
                .is_err(),
            "stream sent a count it should not have"
        );
    }

    #[tokio::test]
    async fn subscribe_unread_count_rejects_unauthenticated() {
        let ctx =
            ctx(MockDatabase::new(DbBackend::Postgres).into_connection()).await;
        let result = subscribe_unread_notification_count::handle(
            ctx,
            Request::new(SubscribeUnreadNotificationCountRequest {}),
            None,
        )
        .await;
        match result {
            Err(err) => assert_eq!(err.code(), Code::Unauthenticated),
            Ok(_) => panic!("unauthenticated request must fail"),
        }
    }

    #[tokio::test]
    async fn subscribe_unread_count_sends_the_current_count_first() {
        let mut stream = subscribe(db_counting(&[3]), "bob", None).await;
        assert_eq!(next_count(&mut stream).await, 3);
    }

    #[tokio::test]
    async fn without_a_change_feed_the_stream_ends_after_the_first_count() {
        let mut stream = subscribe(db_counting(&[3]), "bob", None).await;
        next_count(&mut stream).await;
        assert!(stream.next().await.is_none());
    }

    #[tokio::test]
    async fn a_change_for_the_identity_sends_the_new_count() {
        let (tx, rx) = broadcast::channel(8);
        let mut stream = subscribe(db_counting(&[1, 2]), "bob", Some(rx)).await;
        assert_eq!(next_count(&mut stream).await, 1);

        tx.send("bob".to_string()).unwrap();
        assert_eq!(next_count(&mut stream).await, 2);
    }

    #[tokio::test]
    async fn a_change_for_another_identity_is_ignored() {
        let (tx, rx) = broadcast::channel(8);
        // Only one count is mocked: a re-count would fail loudly.
        let mut stream = subscribe(db_counting(&[1]), "bob", Some(rx)).await;
        next_count(&mut stream).await;

        tx.send("alice".to_string()).unwrap();
        assert_silent(&mut stream).await;
    }

    #[tokio::test]
    async fn an_unchanged_count_is_not_resent() {
        let (tx, rx) = broadcast::channel(8);
        let mut stream =
            subscribe(db_counting(&[1, 1, 4]), "bob", Some(rx)).await;
        next_count(&mut stream).await;

        tx.send("bob".to_string()).unwrap();
        assert_silent(&mut stream).await;

        tx.send("bob".to_string()).unwrap();
        assert_eq!(next_count(&mut stream).await, 4);
    }

    #[tokio::test]
    async fn a_lagged_receiver_recounts() {
        // Capacity one and two sends before the task reads: the first
        // recv reports the lag, which must trigger a re-count.
        let (tx, rx) = broadcast::channel(1);
        tx.send("alice".to_string()).unwrap();
        tx.send("alice".to_string()).unwrap();
        let mut stream = subscribe(db_counting(&[1, 5]), "bob", Some(rx)).await;
        assert_eq!(next_count(&mut stream).await, 1);
        assert_eq!(next_count(&mut stream).await, 5);
    }

    #[tokio::test]
    async fn dropping_the_stream_ends_the_task() {
        let (tx, rx) = broadcast::channel(8);
        let mut stream = subscribe(db_counting(&[1]), "bob", Some(rx)).await;
        next_count(&mut stream).await;
        assert_eq!(tx.receiver_count(), 1);

        drop(stream);
        let deadline = Instant::now() + Duration::from_secs(2);
        while tx.receiver_count() > 0 && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(tx.receiver_count(), 0, "task kept its receiver");
    }

    #[tokio::test]
    async fn closing_the_change_feed_ends_the_stream() {
        let (tx, rx) = broadcast::channel(8);
        let mut stream = subscribe(db_counting(&[1]), "bob", Some(rx)).await;
        next_count(&mut stream).await;

        drop(tx);
        assert!(
            timeout(Duration::from_secs(2), stream.next())
                .await
                .expect("stream did not end")
                .is_none()
        );
    }
}
