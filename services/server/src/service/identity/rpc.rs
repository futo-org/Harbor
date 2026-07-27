//! gRPC `IdentityService` impl. Each method delegates to a handler
//! under `identity/rpc/`.

pub mod common;
pub mod is_banned;
pub mod is_moderator;
pub mod list_bans;
pub mod set_ban_status;

use crate::grpc::content_digest::{ContentDigestLayer, ContentDigestService};
use crate::service::context::ServiceContext;
use crate::service::proto::identity_service_server::{
    IdentityService, IdentityServiceServer,
};
use crate::service::proto::{
    IsBannedRequest, IsBannedResponse, IsModeratorRequest, IsModeratorResponse,
    ListBansRequest, ListBansResponse, SetBanStatusRequest,
    SetBanStatusResponse,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};
use tower_layer::Layer;

pub struct IdentityServiceImpl {
    ctx: Arc<ServiceContext>,
    // This server's canonical name; signed requests must be addressed
    // to it. Same value stamped into SOURCE_SERVER on published events.
    server_name: String,
}

#[tonic::async_trait]
impl IdentityService for IdentityServiceImpl {
    async fn is_moderator(
        &self,
        request: Request<IsModeratorRequest>,
    ) -> Result<Response<IsModeratorResponse>, Status> {
        Ok(Response::new(
            is_moderator::handle(&self.ctx, &self.server_name, request).await?,
        ))
    }

    async fn set_ban_status(
        &self,
        request: Request<SetBanStatusRequest>,
    ) -> Result<Response<SetBanStatusResponse>, Status> {
        Ok(Response::new(
            set_ban_status::handle(&self.ctx, &self.server_name, request)
                .await?,
        ))
    }

    async fn is_banned(
        &self,
        request: Request<IsBannedRequest>,
    ) -> Result<Response<IsBannedResponse>, Status> {
        Ok(Response::new(
            is_banned::handle(&self.ctx, &self.server_name, request).await?,
        ))
    }

    async fn list_bans(
        &self,
        request: Request<ListBansRequest>,
    ) -> Result<Response<ListBansResponse>, Status> {
        Ok(Response::new(
            list_bans::handle(&self.ctx, &self.server_name, request).await?,
        ))
    }
}

/// Creates the identity gRPC service, wrapped in the content-digest
/// middleware. The two are inseparable by construction: signed-request
/// verification trusts the `polycentric-content-digest` header, and this
/// layer is what binds that header to the actual request body. Returning
/// the layered service makes an identity service without body binding
/// unrepresentable — callers can only ever register the safe form.
pub fn build_identity_service(
    ctx: Arc<ServiceContext>,
) -> ContentDigestService<IdentityServiceServer<IdentityServiceImpl>> {
    let service = IdentityServiceServer::new(IdentityServiceImpl {
        ctx,
        server_name: std::env::var("POLYCENTRIC_SERVER_NAME")
            .unwrap_or_default(),
    });
    ContentDigestLayer.layer(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto as Proto;
    use base64::Engine as _;
    use chrono::Utc;
    use ed25519_dalek::{Signer, SigningKey};
    use polycentric_common::http_sig::{
        META_CONTENT_DIGEST, META_PUBLIC_KEY, META_SIGNATURE,
        META_SIGNATURE_INPUT, SCHEME_VERSION, SigParams, content_digest,
        signature_base,
    };
    use prost::Message;
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    const TEST_SERVER: &str = "http://test-server";
    const B64: base64::engine::GeneralPurpose =
        base64::engine::general_purpose::STANDARD;

    const OP_IS_MODERATOR: &str = "/polycentric.v2.IdentityService/IsModerator";
    const OP_SET_BAN: &str = "/polycentric.v2.IdentityService/SetBanStatus";
    const OP_IS_BANNED: &str = "/polycentric.v2.IdentityService/IsBanned";
    const OP_LIST_BANS: &str = "/polycentric.v2.IdentityService/ListBans";

    async fn mock_ctx(db: sea_orm::DatabaseConnection) -> Arc<ServiceContext> {
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        ServiceContext::new(db, kafka_producer)
    }

    /// Service whose identity-events query returns an empty set, so the
    /// signer's key is never authorized for the claimed identity.
    async fn impl_with_no_identity() -> IdentityServiceImpl {
        IdentityServiceImpl {
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
        }
    }

    /// Build a metadata-signed request for `msg`, signed with a fixed
    /// test key over the canonical base for `operation`/`authority`.
    fn signed_request<T: Message>(
        operation: &str,
        authority: &str,
        keyid: &str,
        msg: T,
    ) -> Request<T> {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let digest = content_digest(&msg.encode_to_vec());
        let now = Utc::now().timestamp_millis();
        let params = SigParams {
            version: SCHEME_VERSION,
            created_ms: now,
            expires_ms: now + 60_000,
            keyid: keyid.to_string(),
            nonce: [0u8; 16],
        };
        let input = params.to_header_value();
        let base = signature_base(operation, authority, &digest, &input);
        let sig = signing_key.sign(&base);

        let mut req = Request::new(msg);
        let md = req.metadata_mut();
        md.insert(META_CONTENT_DIGEST, digest.parse().unwrap());
        md.insert(META_SIGNATURE_INPUT, input.parse().unwrap());
        md.insert(
            META_PUBLIC_KEY,
            B64.encode(signing_key.verifying_key().as_bytes())
                .parse()
                .unwrap(),
        );
        md.insert(META_SIGNATURE, B64.encode(sig.to_bytes()).parse().unwrap());
        req
    }

    #[tokio::test]
    async fn is_moderator_rejects_missing_signature_metadata() {
        let service = impl_with_no_identity().await;
        let err = service
            .is_moderator(Request::new(Proto::IsModeratorRequest {}))
            .await
            .unwrap_err();
        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn is_moderator_rejects_malformed_signature_input() {
        let service = impl_with_no_identity().await;
        let mut req = signed_request(
            OP_IS_MODERATOR,
            TEST_SERVER,
            "identity",
            Proto::IsModeratorRequest {},
        );
        req.metadata_mut()
            .insert(META_SIGNATURE_INPUT, "garbage".parse().unwrap());
        let err = service.is_moderator(req).await.unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn is_moderator_rejects_expired_signature() {
        let service = impl_with_no_identity().await;
        let mut req = signed_request(
            OP_IS_MODERATOR,
            TEST_SERVER,
            "identity",
            Proto::IsModeratorRequest {},
        );
        // Re-sign with a window that ended over an hour ago.
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let digest =
            content_digest(&Proto::IsModeratorRequest {}.encode_to_vec());
        let now = Utc::now().timestamp_millis();
        let params = SigParams {
            version: SCHEME_VERSION,
            created_ms: now - 62 * 60 * 1000,
            expires_ms: now - 61 * 60 * 1000,
            keyid: "identity".to_string(),
            nonce: [0u8; 16],
        };
        let input = params.to_header_value();
        let base =
            signature_base(OP_IS_MODERATOR, TEST_SERVER, &digest, &input);
        let sig = signing_key.sign(&base);
        let md = req.metadata_mut();
        md.insert(META_SIGNATURE_INPUT, input.parse().unwrap());
        md.insert(META_SIGNATURE, B64.encode(sig.to_bytes()).parse().unwrap());

        let err = service.is_moderator(req).await.unwrap_err();
        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn relayed_signature_is_rejected() {
        // Signed for another server: this server rebuilds the base with
        // its own authority, so the signature fails.
        let service = impl_with_no_identity().await;
        let req = signed_request(
            OP_IS_MODERATOR,
            "http://another-server",
            "identity",
            Proto::IsModeratorRequest {},
        );
        let err = service.is_moderator(req).await.unwrap_err();
        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn tampered_digest_is_rejected() {
        // The digest header is covered by the signature; changing it (as
        // a body swap would require) invalidates the signature.
        let service = impl_with_no_identity().await;
        let mut req = signed_request(
            OP_SET_BAN,
            TEST_SERVER,
            "moderator",
            Proto::SetBanStatusRequest {
                target_identity: "target".to_string(),
                banned: true,
            },
        );
        req.metadata_mut().insert(
            META_CONTENT_DIGEST,
            content_digest(b"tampered").parse().unwrap(),
        );
        let err = service.set_ban_status(req).await.unwrap_err();
        assert_eq!(err.code(), Code::Unauthenticated);
    }

    #[tokio::test]
    async fn is_moderator_rejects_unauthorized_key() {
        // Valid signature, but the mock database has no identity events,
        // so the signer's key is not authorized for the claimed identity.
        let service = impl_with_no_identity().await;
        let req = signed_request(
            OP_IS_MODERATOR,
            TEST_SERVER,
            "identity",
            Proto::IsModeratorRequest {},
        );
        let err = service.is_moderator(req).await.unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn set_ban_status_rejects_unauthorized_key() {
        let service = impl_with_no_identity().await;
        let req = signed_request(
            OP_SET_BAN,
            TEST_SERVER,
            "moderator",
            Proto::SetBanStatusRequest {
                target_identity: "target".to_string(),
                banned: true,
            },
        );
        let err = service.set_ban_status(req).await.unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn is_banned_rejects_unauthorized_key() {
        let service = impl_with_no_identity().await;
        let req = signed_request(
            OP_IS_BANNED,
            TEST_SERVER,
            "moderator",
            Proto::IsBannedRequest {
                target_identity: "target".to_string(),
            },
        );
        let err = service.is_banned(req).await.unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn list_bans_rejects_unauthorized_key() {
        let service = impl_with_no_identity().await;
        let req = signed_request(
            OP_LIST_BANS,
            TEST_SERVER,
            "moderator",
            Proto::ListBansRequest::default(),
        );
        let err = service.list_bans(req).await.unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }
}
