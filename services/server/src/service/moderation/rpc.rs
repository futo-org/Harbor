//! gRPC `ModerationService` impl. Each method delegates to a handler
//! under `moderation/rpc/`. Every endpoint requires the caller (bearer
//! JWT, see `auth_middleware`) to be a moderator on this server.

use std::sync::Arc;
use tonic::{Request, Response, Status};

use crate::service::context::ServiceContext;
use crate::service::proto::moderation_service_server::{
    ModerationService, ModerationServiceServer,
};
use crate::service::proto::{SetLabelsRequest, SetLabelsResponse};

pub mod set_labels;

pub struct ModerationServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl ModerationService for ModerationServiceImpl {
    async fn set_labels(
        &self,
        request: Request<SetLabelsRequest>,
    ) -> Result<Response<SetLabelsResponse>, Status> {
        let ctx = self.ctx.authenticted_ro(&request).await?;
        Ok(Response::new(
            set_labels::handle(ctx, request.into_inner()).await?,
        ))
    }
}

pub fn build_moderation_service(
    ctx: Arc<ServiceContext>,
) -> ModerationServiceServer<ModerationServiceImpl> {
    ModerationServiceServer::new(ModerationServiceImpl { ctx })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use entity::moderator;
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    use crate::service::proto::{EventKey, PublicKey};
    use crate::service::verifications::rpc::common::tests::ctx;

    use super::*;

    const MODERATOR: &str = "moderator-identity";

    fn moderator_rows() -> Vec<moderator::Model> {
        let now = Utc::now();
        vec![moderator::Model {
            identity: MODERATOR.to_string(),
            created_at: now,
            updated_at: now,
        }]
    }

    fn target() -> EventKey {
        EventKey {
            collection: 2,
            identity: "author".into(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![1, 2, 3],
            }),
            sequence: 7,
        }
    }

    #[tokio::test]
    async fn set_labels_rejects_non_moderators() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([Vec::<moderator::Model>::new()])
            .into_connection();
        let ctx = ctx(db).await.test_auth("someone").await;
        let err = set_labels::handle(
            ctx,
            SetLabelsRequest {
                target: Some(target()),
                label_values: vec!["hate".into()],
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn set_labels_requires_a_target() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows()])
            .into_connection();
        let ctx = ctx(db).await.test_auth(MODERATOR).await;
        let err = set_labels::handle(
            ctx,
            SetLabelsRequest {
                target: None,
                label_values: vec!["hate".into()],
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn set_labels_rejects_unknown_labels() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows()])
            .into_connection();
        let ctx = ctx(db).await.test_auth(MODERATOR).await;
        let err = set_labels::handle(
            ctx,
            SetLabelsRequest {
                target: Some(target()),
                label_values: vec!["hate".into(), "not-a-label".into()],
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("not-a-label"), "{}", err.message());
    }
}
