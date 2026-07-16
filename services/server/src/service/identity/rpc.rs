//! gRPC `IdentityService` impl. Each method delegates to a handler
//! under `identity/rpc/`.

pub mod is_moderator;

use crate::service::proto::identity_service_server::{
    IdentityService, IdentityServiceServer,
};
use crate::service::proto::{IsModeratorResponse, SignedMessage};
use sea_orm::DatabaseConnection;
use tonic::{Request, Response, Status};

pub struct IdentityServiceImpl {
    db: DatabaseConnection,
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
                &self.db,
                &self.server_name,
                request.into_inner(),
            )
            .await?,
        ))
    }
}

/// Creates the gRPC service implementation for identity APIs.
pub fn build_identity_service(
    db: DatabaseConnection,
) -> IdentityServiceServer<IdentityServiceImpl> {
    IdentityServiceServer::new(IdentityServiceImpl {
        db,
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

    fn impl_for_testing() -> IdentityServiceImpl {
        IdentityServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres).into_connection(),
            server_name: TEST_SERVER.to_string(),
        }
    }

    fn make_signed_body(identity: &str, timestamp: i64) -> SignedMessage {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let body = Proto::IsModeratorBody {
            identity: identity.to_string(),
            timestamp,
            server_url: TEST_SERVER.to_string(),
        };
        let message_bytes = Message::encode_to_vec(&body);
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

    #[tokio::test]
    async fn is_moderator_rejects_invalid_signature() {
        let service = impl_for_testing();
        let mut msg =
            make_signed_body("identity", Utc::now().timestamp_millis());
        msg.signature[0] ^= 1;

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn is_moderator_rejects_missing_public_key() {
        let service = impl_for_testing();
        let mut msg =
            make_signed_body("identity", Utc::now().timestamp_millis());
        msg.public_key = None;

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn is_moderator_rejects_stale_timestamp() {
        let service = impl_for_testing();
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
            db: MockDatabase::new(DbBackend::Postgres).into_connection(),
            server_name: "http://another-server".to_string(),
        };
        let msg = make_signed_body("identity", Utc::now().timestamp_millis());

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn is_moderator_rejects_unauthorized_key() {
        // Signature and timestamp are valid, but the mock database has no
        // identity events, so the signer is not an authorized key.
        let service = IdentityServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres)
                .append_query_results::<(
                    ::entity::event_model::Model,
                    Option<::entity::content_model::Model>,
                ), _, _>(vec![vec![]])
                .into_connection(),
            server_name: TEST_SERVER.to_string(),
        };
        let msg = make_signed_body("identity", Utc::now().timestamp_millis());

        let err = service.is_moderator(Request::new(msg)).await.unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }
}
