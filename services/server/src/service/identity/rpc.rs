//! gRPC `IdentityService` impl. Each method delegates to a handler
//! under `identity/rpc/`.

pub mod common;
pub mod is_banned;
pub mod is_moderator;
pub mod list_bans;
pub mod set_ban_status;

use crate::service::context::ServiceContext;
use crate::service::proto::identity_service_server::{
    IdentityService, IdentityServiceServer,
};
use crate::service::proto::{
    IsBannedResponse, IsModeratorResponse, ListBansResponse,
    SetBanStatusResponse, SignedMessage,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct IdentityServiceImpl {
    ctx: Arc<ServiceContext>,
    // This server's canonical name; signed request bodies must be
    // addressed to it. Same value stamped into SOURCE_SERVER on
    // published events.
    server_name: String,
}

#[tonic::async_trait]
impl IdentityService for IdentityServiceImpl {
    async fn is_moderator(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<IsModeratorResponse>, Status> {
        Ok(Response::new(
            is_moderator::handle(
                &self.ctx,
                &self.server_name,
                request.into_inner(),
            )
            .await?,
        ))
    }

    async fn set_ban_status(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<SetBanStatusResponse>, Status> {
        Ok(Response::new(
            set_ban_status::handle(
                &self.ctx,
                &self.server_name,
                request.into_inner(),
            )
            .await?,
        ))
    }

    async fn is_banned(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<IsBannedResponse>, Status> {
        Ok(Response::new(
            is_banned::handle(
                &self.ctx,
                &self.server_name,
                request.into_inner(),
            )
            .await?,
        ))
    }

    async fn list_bans(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<ListBansResponse>, Status> {
        Ok(Response::new(
            list_bans::handle(
                &self.ctx,
                &self.server_name,
                request.into_inner(),
            )
            .await?,
        ))
    }
}

/// Creates the gRPC service implementation for identity APIs.
pub fn build_identity_service(
    ctx: Arc<ServiceContext>,
) -> IdentityServiceServer<IdentityServiceImpl> {
    IdentityServiceServer::new(IdentityServiceImpl {
        ctx,
        server_name: std::env::var("POLYCENTRIC_SERVER_NAME")
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto as Proto;
    use chrono::Utc;
    use ed25519_dalek::{Signer, SigningKey};
    use prost::Message;
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    const TEST_SERVER: &str = "http://test-server";

    async fn mock_ctx(db: sea_orm::DatabaseConnection) -> Arc<ServiceContext> {
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        ServiceContext::new(db, kafka_producer)
    }

    async fn impl_for_testing() -> IdentityServiceImpl {
        IdentityServiceImpl {
            ctx: mock_ctx(
                MockDatabase::new(DbBackend::Postgres).into_connection(),
            )
            .await,
            server_name: TEST_SERVER.to_string(),
        }
    }

    fn sign_bytes(message_bytes: Vec<u8>) -> SignedMessage {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let signature = signing_key.sign(&message_bytes);

        SignedMessage {
            signature: signature.to_bytes().to_vec(),
            message_bytes,
            public_key: Some(Proto::PublicKey {
                key_type: Proto::KeyType::Ed25519.into(),
                key: signing_key.verifying_key().as_bytes().to_vec(),
            }),
        }
    }

    fn make_signed_body(identity: &str, timestamp: i64) -> SignedMessage {
        sign_bytes(Message::encode_to_vec(&Proto::IsModeratorBody {
            identity: identity.to_string(),
            timestamp,
            server_url: TEST_SERVER.to_string(),
        }))
    }

    fn make_signed_ban_body(server_url: &str) -> SignedMessage {
        sign_bytes(Message::encode_to_vec(&Proto::SetBanStatusBody {
            moderator_identity: "moderator".to_string(),
            target_identity: "target".to_string(),
            timestamp: Utc::now().timestamp_millis(),
            server_url: server_url.to_string(),
            banned: true,
        }))
    }

    fn make_signed_is_banned_body(server_url: &str) -> SignedMessage {
        sign_bytes(Message::encode_to_vec(&Proto::IsBannedBody {
            moderator_identity: "moderator".to_string(),
            target_identity: "target".to_string(),
            timestamp: Utc::now().timestamp_millis(),
            server_url: server_url.to_string(),
        }))
    }

    fn make_signed_list_bans_body(server_url: &str) -> SignedMessage {
        sign_bytes(Message::encode_to_vec(&Proto::ListBansBody {
            moderator_identity: "moderator".to_string(),
            timestamp: Utc::now().timestamp_millis(),
            server_url: server_url.to_string(),
        }))
    }

    #[tokio::test]
    async fn is_moderator_rejects_invalid_signature() {
        let service = impl_for_testing().await;
        let mut msg =
            make_signed_body("identity", Utc::now().timestamp_millis());
        msg.signature[0] ^= 1;

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn is_moderator_rejects_missing_public_key() {
        let service = impl_for_testing().await;
        let mut msg =
            make_signed_body("identity", Utc::now().timestamp_millis());
        msg.public_key = None;

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn is_moderator_rejects_stale_timestamp() {
        let service = impl_for_testing().await;
        let msg = make_signed_body(
            "identity",
            Utc::now().timestamp_millis() - 60 * 60 * 1000,
        );

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn is_moderator_rejects_wrong_server_url() {
        // Valid signature and timestamp, but the signed body is addressed
        // to a different server, e.g. relayed by the server it was sent to.
        let service = IdentityServiceImpl {
            ctx: mock_ctx(
                MockDatabase::new(DbBackend::Postgres).into_connection(),
            )
            .await,
            server_name: "http://another-server".to_string(),
        };
        let msg = make_signed_body("identity", Utc::now().timestamp_millis());

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn set_ban_status_rejects_invalid_signature() {
        let service = impl_for_testing().await;
        let mut msg = make_signed_ban_body(TEST_SERVER);
        msg.signature[0] ^= 1;

        let err = service.set_ban_status(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn set_ban_status_rejects_wrong_server_url() {
        let service = impl_for_testing().await;
        let msg = make_signed_ban_body("http://another-server");

        let err = service.set_ban_status(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn set_ban_status_rejects_unauthorized_key() {
        // Valid signature, but the mock database has no identity events,
        // so the signer is not an authorized key of the moderator identity.
        let service = IdentityServiceImpl {
            ctx: mock_ctx(
                MockDatabase::new(DbBackend::Postgres)
                    .append_query_results::<(
                        ::entity::event_model::Model,
                        Option<::entity::content_model::Model>,
                    ), _, _>(vec![vec![]])
                    .into_connection(),
            )
            .await,
            server_name: TEST_SERVER.to_string(),
        };
        let msg = make_signed_ban_body(TEST_SERVER);

        let err = service.set_ban_status(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn is_banned_rejects_invalid_signature() {
        let service = impl_for_testing().await;
        let mut msg = make_signed_is_banned_body(TEST_SERVER);
        msg.signature[0] ^= 1;

        let err = service.is_banned(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn is_banned_rejects_wrong_server_url() {
        let service = impl_for_testing().await;
        let msg = make_signed_is_banned_body("http://another-server");

        let err = service.is_banned(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn list_bans_rejects_invalid_signature() {
        let service = impl_for_testing().await;
        let mut msg = make_signed_list_bans_body(TEST_SERVER);
        msg.signature[0] ^= 1;

        let err = service.list_bans(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn list_bans_rejects_wrong_server_url() {
        let service = impl_for_testing().await;
        let msg = make_signed_list_bans_body("http://another-server");

        let err = service.list_bans(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn is_moderator_rejects_unauthorized_key() {
        // Signature and timestamp are valid, but the mock database has no
        // identity events, so the signer is not an authorized key.
        let service = IdentityServiceImpl {
            ctx: mock_ctx(
                MockDatabase::new(DbBackend::Postgres)
                    .append_query_results::<(
                        ::entity::event_model::Model,
                        Option<::entity::content_model::Model>,
                    ), _, _>(vec![vec![]])
                    .into_connection(),
            )
            .await,
            server_name: TEST_SERVER.to_string(),
        };
        let msg = make_signed_body("identity", Utc::now().timestamp_millis());

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }
}
