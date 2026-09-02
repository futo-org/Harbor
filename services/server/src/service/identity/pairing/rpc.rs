//! gRPC `PairingService` impl. Each method delegates to a handler
//! under `pairing/rpc/`.

use std::sync::Arc;

use tonic::{Request, Response, Status};

use crate::service::context::ServiceContext;
use crate::service::proto::pairing_service_server::{
    PairingService, PairingServiceServer,
};
use crate::service::proto::{
    CreatePairingSessionRequest, CreatePairingSessionResponse,
    GetPairingSessionRequest, GetPairingSessionResponse,
    JoinPairingSessionRequest, JoinPairingSessionResponse,
};

pub mod common;
pub mod create_pairing_session;
pub mod get_pairing_session;
pub mod join_pairing_session;

pub struct PairingServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl PairingService for PairingServiceImpl {
    async fn create_pairing_session(
        &self,
        request: Request<CreatePairingSessionRequest>,
    ) -> Result<Response<CreatePairingSessionResponse>, Status> {
        Ok(Response::new(
            create_pairing_session::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn get_pairing_session(
        &self,
        request: Request<GetPairingSessionRequest>,
    ) -> Result<Response<GetPairingSessionResponse>, Status> {
        Ok(Response::new(
            get_pairing_session::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }

    async fn join_pairing_session(
        &self,
        request: Request<JoinPairingSessionRequest>,
    ) -> Result<Response<JoinPairingSessionResponse>, Status> {
        Ok(Response::new(
            join_pairing_session::handle(&self.ctx, request.into_inner())
                .await?,
        ))
    }
}

/// Creates the gRPC service implementation for pairing sessions.
pub fn build_pairing_service(
    ctx: Arc<ServiceContext>,
) -> PairingServiceServer<PairingServiceImpl> {
    PairingServiceServer::new(PairingServiceImpl { ctx })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use common_kafka::build_producer;
    use ed25519_dalek::{Signer, SigningKey};
    use prost::Message;
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    use crate::service::proto as Proto;
    use crate::service::proto::SignedMessage;

    use super::*;

    async fn impl_for_testing() -> PairingServiceImpl {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let kafka_producer = build_producer()
            .await
            .expect("failed to build Kafka producer");
        let ctx = ServiceContext::new(db, kafka_producer);
        PairingServiceImpl { ctx }
    }

    fn make_signed_initial_session(
        issuer_identity: &str,
        timestamp: i64,
    ) -> SignedMessage {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let initial_session = Proto::InitialPairingSession {
            issuer_identity: issuer_identity.to_string(),
            timestamp,
        };
        let message_bytes = Message::encode_to_vec(&initial_session);
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

    #[test]
    fn verify_signed_message_accepts_valid_signature() {
        let msg = make_signed_initial_session("issuer", 1_700_000_000_000);
        let (public_key, _) = msg.open().unwrap();

        assert_eq!(
            public_key.key,
            SigningKey::from_bytes(&[7u8; 32])
                .verifying_key()
                .as_bytes()
                .to_vec()
        );
        assert_eq!(public_key.key_type, Proto::KeyType::Ed25519 as i32);
    }

    #[tokio::test]
    async fn create_pairing_session_rejects_missing_signed_message() {
        let service = impl_for_testing().await;
        let err = service
            .create_pairing_session(Request::new(CreatePairingSessionRequest {
                signed_message: None,
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_pairing_session_rejects_timestamp_too_far_in_future() {
        let service = impl_for_testing().await;
        let msg = make_signed_initial_session(
            "issuer",
            Utc::now().timestamp_millis() + 60 * 60 * 1000,
        );

        let err = service
            .create_pairing_session(Request::new(CreatePairingSessionRequest {
                signed_message: Some(msg),
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_pairing_session_rejects_timestamp_too_far_in_past() {
        let service = impl_for_testing().await;
        let msg = make_signed_initial_session(
            "issuer",
            Utc::now().timestamp_millis() - 60 * 60 * 1000,
        );

        let err = service
            .create_pairing_session(Request::new(CreatePairingSessionRequest {
                signed_message: Some(msg),
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_pairing_session_rejects_invalid_signature() {
        let service = impl_for_testing().await;
        let mut msg = make_signed_initial_session("issuer", 1_700_000_000_000);
        msg.signature[0] ^= 1;

        let err = service
            .create_pairing_session(Request::new(CreatePairingSessionRequest {
                signed_message: Some(msg),
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn join_pairing_session_rejects_missing_signed_message() {
        let service = impl_for_testing().await;
        let err = service
            .join_pairing_session(Request::new(JoinPairingSessionRequest {
                signed_message: None,
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn join_pairing_session_rejects_invalid_body() {
        let service = impl_for_testing().await;
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let body_bytes = vec![1, 2, 3];
        let signature = signing_key.sign(&body_bytes);
        let msg = SignedMessage {
            signature: signature.to_bytes().to_vec(),
            message_bytes: body_bytes,
            public_key: Some(Proto::PublicKey {
                key_type: Proto::KeyType::Ed25519.into(),
                key: signing_key.verifying_key().as_bytes().to_vec(),
            }),
        };

        let err = service
            .join_pairing_session(Request::new(JoinPairingSessionRequest {
                signed_message: Some(msg),
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn join_pairing_session_rejects_invalid_signature() {
        let service = impl_for_testing().await;
        let mut msg = make_signed_initial_session("issuer", 1_700_000_000_000);
        msg.signature[0] ^= 1;

        let err = service
            .join_pairing_session(Request::new(JoinPairingSessionRequest {
                signed_message: Some(msg),
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::Unauthenticated);
    }
}
