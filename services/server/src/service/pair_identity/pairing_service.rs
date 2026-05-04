use crate::service::identity::identity_repository as id_repo;
use crate::service::pair_identity::pairing_repository as pair_repo;
use crate::service::proto as Proto;
use crate::service::proto::pairing_service_server::{
    PairingService, PairingServiceServer,
};
use crate::service::proto::{
    CreatePairingSessionRequest, CreatePairingSessionResponse,
    GetPairingSessionRequest, GetPairingSessionResponse,
    JoinPairingSessionBody, JoinPairingSessionRequest,
    JoinPairingSessionResponse, SignedMessage,
};
use crate::util;
use chrono::{DateTime, Utc};
use prost::Message;
use sea_orm::DatabaseConnection;
use tonic::{Request, Response, Status};

pub struct PairingServiceImpl {
    db: DatabaseConnection,
}

#[tonic::async_trait]
impl PairingService for PairingServiceImpl {
    /// Registers a new pairing session after verifying the caller is a rotation key.
    async fn create_pairing_session(
        &self,
        request: Request<CreatePairingSessionRequest>,
    ) -> Result<Response<CreatePairingSessionResponse>, Status> {
        let msg = request.into_inner().signed_message.ok_or_else(|| {
            Status::invalid_argument("signed_message is required")
        })?;
        let public_key = verify_signed_message(&msg)?;

        let initial_session =
            Proto::InitialPairingSession::decode(&msg.message_bytes[..])
                .map_err(|_| Status::invalid_argument("invalid session"))?;

        if initial_session.created_at > Utc::now().timestamp_millis() {
            return Err(Status::invalid_argument(
                "session created_at must be in the past",
            ));
        }

        let created_at =
            DateTime::<Utc>::from_timestamp_millis(initial_session.created_at)
                .ok_or_else(|| {
                    Status::invalid_argument("invalid session created_at")
                })?;
        let expires_at = created_at
            + chrono::Duration::seconds(
                pair_repo::PAIRING_SESSION_TTL_SECONDS as i64,
            );

        let issuer_identity = initial_session.issuer_identity.clone();
        let pairing_session_signature = util::hex::encode(&msg.signature);

        let is_rotation_key = id_repo::Query::is_rotation_key(
            &self.db,
            &issuer_identity,
            public_key.key.as_slice(),
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;

        if !is_rotation_key {
            return Err(Status::permission_denied("not authorized"));
        }

        let row = pair_repo::Query::create_pairing_session(
            &self.db,
            &issuer_identity,
            &pairing_session_signature,
            &public_key,
            created_at,
            expires_at,
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;

        Ok(Response::new(CreatePairingSessionResponse {
            session: Some(Proto::PairingSession {
                pairing_session_signature: row.pairing_session_signature,
                signed_by: Some(Proto::PublicKey {
                    key_type: row.signed_by_key_type,
                    key: row.signed_by_key,
                }),
                initial_session: Some(Proto::InitialPairingSession {
                    issuer_identity: row.issuer_identity,
                    created_at: row.created_at.timestamp_millis(),
                }),
                expires_at: row.expires_at.timestamp_millis(),
                claimer_pubkeys: vec![],
            }),
        }))
    }

    /// Returns a pairing session for an active session signature.
    ///
    /// Expired sessions are deleted and treated as not found.
    async fn get_pairing_session(
        &self,
        request: Request<GetPairingSessionRequest>,
    ) -> Result<Response<GetPairingSessionResponse>, Status> {
        let req = request.into_inner();
        let session =
            build_pairing_session(&self.db, &req.pairing_session_signature)
                .await?;

        Ok(Response::new(GetPairingSessionResponse {
            session: Some(session),
        }))
    }

    /// Records a claimer key for an active pairing session and returns updated session.
    ///
    /// Expired sessions are deleted before returning an expiry error.
    async fn join_pairing_session(
        &self,
        request: Request<JoinPairingSessionRequest>,
    ) -> Result<Response<JoinPairingSessionResponse>, Status> {
        let msg = request.into_inner().signed_message.ok_or_else(|| {
            Status::invalid_argument("signed_message is required")
        })?;
        let public_key = verify_signed_message(&msg)?;

        let body = JoinPairingSessionBody::decode(&msg.message_bytes[..])
            .map_err(|_| Status::invalid_argument("invalid body"))?;

        let session = pair_repo::Query::get_pairing_session(
            &self.db,
            &body.pairing_session_signature,
        )
        .await
        .map_err(|_| Status::not_found("session not found"))?;
        if pair_repo::is_pairing_session_expired(&session) {
            pair_repo::Query::delete_pairing_session(
                &self.db,
                &body.pairing_session_signature,
            )
            .await
            .map_err(|_| Status::internal("internal server error"))?;
            return Err(Status::deadline_exceeded("session expired"));
        }

        pair_repo::Query::add_claimer_pubkey(
            &self.db,
            &body.pairing_session_signature,
            &public_key,
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;

        let session =
            build_pairing_session(&self.db, &body.pairing_session_signature)
                .await?;

        Ok(Response::new(JoinPairingSessionResponse {
            session: Some(session),
        }))
    }
}

/// Verifies a signed pairing request and returns the signer public key.
fn verify_signed_message(
    msg: &SignedMessage,
) -> Result<Proto::PublicKey, Status> {
    let public_key = msg
        .public_key
        .clone()
        .ok_or_else(|| Status::invalid_argument("public_key is required"))?;
    util::signing::verify_signature(
        &public_key.key,
        &msg.signature,
        &msg.message_bytes,
    )
    .map_err(|e| Status::unauthenticated(e.to_string()))?;
    Ok(public_key)
}

/// Builds `PairingSession` from the stored session row and current claimers.
async fn build_pairing_session(
    db: &DatabaseConnection,
    pairing_session_signature: &str,
) -> Result<Proto::PairingSession, Status> {
    let session =
        pair_repo::Query::get_pairing_session(db, pairing_session_signature)
            .await
            .map_err(|_| Status::not_found("session not found"))?;

    if pair_repo::is_pairing_session_expired(&session) {
        pair_repo::Query::delete_pairing_session(db, pairing_session_signature)
            .await
            .map_err(|_| Status::internal("internal server error"))?;
        return Err(Status::not_found("session not found"));
    }

    let claimer_pubkeys =
        pair_repo::Query::list_claimer_pubkeys(db, pairing_session_signature)
            .await
            .map_err(|_| Status::internal("internal server error"))?;

    Ok(Proto::PairingSession {
        pairing_session_signature: session.pairing_session_signature.clone(),
        signed_by: Some(Proto::PublicKey {
            key_type: session.signed_by_key_type,
            key: session.signed_by_key.clone(),
        }),
        initial_session: Some(Proto::InitialPairingSession {
            issuer_identity: session.issuer_identity.clone(),
            created_at: session.created_at.timestamp_millis(),
        }),
        expires_at: session.expires_at.timestamp_millis(),
        claimer_pubkeys,
    })
}

/// Creates the gRPC service implementation for pairing sessions.
pub fn build_pairing_service(
    db: DatabaseConnection,
) -> PairingServiceServer<PairingServiceImpl> {
    PairingServiceServer::new(PairingServiceImpl { db })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    fn impl_for_testing() -> PairingServiceImpl {
        PairingServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres).into_connection(),
        }
    }

    fn make_signed_initial_session(
        issuer_identity: &str,
        created_at: i64,
    ) -> SignedMessage {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let initial_session = Proto::InitialPairingSession {
            issuer_identity: issuer_identity.to_string(),
            created_at,
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
        let created_at = Utc::now().timestamp_millis();
        let msg = make_signed_initial_session("issuer", created_at);
        let public_key = verify_signed_message(&msg).unwrap();

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
        let service = impl_for_testing();
        let err = service
            .create_pairing_session(Request::new(CreatePairingSessionRequest {
                signed_message: None,
            }))
            .await
            .unwrap_err();

        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn create_pairing_session_rejects_future_created_at() {
        let service = impl_for_testing();
        let msg = make_signed_initial_session(
            "issuer",
            Utc::now().timestamp_millis() + 60_000,
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
        let service = impl_for_testing();
        let mut msg = make_signed_initial_session(
            "issuer",
            Utc::now().timestamp_millis(),
        );
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
        let service = impl_for_testing();
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
        let service = impl_for_testing();
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
        let service = impl_for_testing();
        let mut msg = make_signed_initial_session(
            "issuer",
            Utc::now().timestamp_millis(),
        );
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
