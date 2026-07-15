//! gRPC `IdentityService` impl. Each method delegates to a handler
//! under `identity/rpc/`.

pub mod list_identity_flags;

use crate::service::proto::identity_service_server::{
    IdentityService, IdentityServiceServer,
};
use crate::service::proto::{ListIdentityFlagsResponse, SignedMessage};
use sea_orm::DatabaseConnection;
use tonic::{Request, Response, Status};

pub struct IdentityServiceImpl {
    db: DatabaseConnection,
}

#[tonic::async_trait]
impl IdentityService for IdentityServiceImpl {
    async fn list_identity_flags(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<ListIdentityFlagsResponse>, Status> {
        Ok(Response::new(
            list_identity_flags::handle(&self.db, request.into_inner()).await?,
        ))
    }
}

/// Creates the gRPC service implementation for identity APIs.
pub fn build_identity_service(
    db: DatabaseConnection,
) -> IdentityServiceServer<IdentityServiceImpl> {
    IdentityServiceServer::new(IdentityServiceImpl { db })
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

    fn impl_for_testing() -> IdentityServiceImpl {
        IdentityServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres).into_connection(),
        }
    }

    fn make_signed_body(identity: &str, timestamp: i64) -> SignedMessage {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let body = Proto::ListIdentityFlagsBody {
            identity: identity.to_string(),
            timestamp,
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
    async fn list_identity_flags_rejects_invalid_signature() {
        let service = impl_for_testing();
        let mut msg =
            make_signed_body("identity", Utc::now().timestamp_millis());
        msg.signature[0] ^= 1;

        let err = service
            .list_identity_flags(Request::new(msg))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn list_identity_flags_rejects_missing_public_key() {
        let service = impl_for_testing();
        let mut msg =
            make_signed_body("identity", Utc::now().timestamp_millis());
        msg.public_key = None;

        let err = service
            .list_identity_flags(Request::new(msg))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_identity_flags_rejects_stale_timestamp() {
        let service = impl_for_testing();
        let msg = make_signed_body(
            "identity",
            Utc::now().timestamp_millis() - 60 * 60 * 1000,
        );

        let err = service
            .list_identity_flags(Request::new(msg))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn list_identity_flags_rejects_unauthorized_key() {
        // Signature and timestamp are valid, but the mock database has no
        // identity events, so the signer is not an authorized key.
        let service = IdentityServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres)
                .append_query_results::<(
                    ::entity::event_model::Model,
                    Option<::entity::content_model::Model>,
                ), _, _>(vec![vec![]])
                .into_connection(),
        };
        let msg = make_signed_body("identity", Utc::now().timestamp_millis());

        let err = service
            .list_identity_flags(Request::new(msg))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::PermissionDenied);
    }
}
