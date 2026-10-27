//! gRPC `ModerationService` impl. Each method delegates to a handler
//! under `moderation/rpc/`. Every endpoint requires the caller (bearer
//! JWT, see `auth_middleware`) to be a moderator on this server.

use std::sync::Arc;
use tonic::{Request, Response, Status};

use crate::service::context::ServiceContext;
use crate::service::proto::moderation_service_server::{
    ModerationService, ModerationServiceServer,
};
use crate::service::proto::{
    DeleteContentRequest, DeleteContentResponse, ListReportsRequest,
    ListReportsResponse, ResolveReportRequest, ResolveReportResponse,
};

pub mod common;
pub mod delete_content;
pub mod list_reports;
pub mod resolve_report;

pub struct ModerationServiceImpl {
    ctx: Arc<ServiceContext>,
}

#[tonic::async_trait]
impl ModerationService for ModerationServiceImpl {
    async fn list_reports(
        &self,
        request: Request<ListReportsRequest>,
    ) -> Result<Response<ListReportsResponse>, Status> {
        let ctx = self.ctx.authenticted_ro(&request).await?;
        Ok(Response::new(
            list_reports::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn resolve_report(
        &self,
        request: Request<ResolveReportRequest>,
    ) -> Result<Response<ResolveReportResponse>, Status> {
        let ctx = self.ctx.authenticted_rw(&request).await?;
        Ok(Response::new(
            resolve_report::handle(ctx, request.into_inner()).await?,
        ))
    }

    async fn delete_content(
        &self,
        request: Request<DeleteContentRequest>,
    ) -> Result<Response<DeleteContentResponse>, Status> {
        let ctx = self.ctx.authenticted_rw(&request).await?;
        Ok(Response::new(
            delete_content::handle(ctx, request.into_inner()).await?,
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
    use std::collections::BTreeMap;

    use chrono::Utc;
    use entity::moderator;
    use sea_orm::{DbBackend, MockDatabase, MockExecResult, Value};
    use tonic::Code;

    use crate::service::proto::{ReportCategory, ReportStatus};
    use crate::service::verifications::rpc::common::tests::ctx;

    use super::*;

    const MODERATOR: &str = "moderator-identity";

    fn moderator_rows(is_moderator: bool) -> Vec<moderator::Model> {
        if !is_moderator {
            return vec![];
        }
        let now = Utc::now();
        vec![moderator::Model {
            identity: MODERATOR.to_string(),
            created_at: now,
            updated_at: now,
        }]
    }

    fn report_row(
        content_id: i64,
        latest_event_id: i64,
    ) -> BTreeMap<&'static str, Value> {
        BTreeMap::from([
            ("content_id", Value::BigInt(Some(content_id))),
            (
                "category",
                Value::SmallInt(Some(ReportCategory::Spam as i16)),
            ),
            ("additional_info", Value::String(Some("spammy".into()))),
            ("event_key_collection", Value::SmallInt(Some(2))),
            ("event_key_identity", Value::String(Some("author".into()))),
            ("event_key_public_key_type", Value::SmallInt(Some(1))),
            ("event_key_public_key", Value::Bytes(Some(vec![1, 2, 3]))),
            ("event_key_sequence", Value::BigInt(Some(7))),
            ("report_count", Value::BigInt(Some(2))),
            ("latest_event_id", Value::BigInt(Some(latest_event_id))),
            (
                "latest_reported_at",
                Value::ChronoDateTimeWithTimeZone(Some(
                    Utc::now().fixed_offset(),
                )),
            ),
            (
                "reporters",
                Value::Array(
                    sea_orm::sea_query::ArrayType::String,
                    Some(Box::new(vec![
                        Value::String(Some("alice".into())),
                        Value::String(Some("bob".into())),
                    ])),
                ),
            ),
            ("status", Value::SmallInt(None)),
            ("resolved_by", Value::String(None)),
            ("resolved_at", Value::ChronoDateTimeUtc(None)),
        ])
    }

    #[tokio::test]
    async fn list_reports_rejects_non_moderators() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(false)])
            .into_connection();
        let ctx = ctx(db).await.test_auth("someone").await;
        let err = list_reports::handle(ctx, ListReportsRequest::default())
            .await
            .unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn list_reports_maps_rows_and_pages_by_latest_event() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(true)])
            .append_query_results([vec![
                report_row(10, 300),
                report_row(11, 400),
                report_row(12, 500),
            ]])
            .into_connection();
        let ctx = ctx(db).await.test_auth(MODERATOR).await;
        let response = list_reports::handle(
            ctx,
            ListReportsRequest {
                limit: Some(2),
                after: None,
                status: ReportStatus::Open as i32,
            },
        )
        .await
        .unwrap();

        assert_eq!(response.reports.len(), 2, "over-fetched row is dropped");
        let first = &response.reports[0];
        assert_eq!(first.report_id, 10);
        assert_eq!(first.category, ReportCategory::Spam as i32);
        assert_eq!(first.report_count, 2);
        assert_eq!(first.reporters, vec!["alice", "bob"]);
        assert_eq!(
            first.status,
            ReportStatus::Open as i32,
            "no resolution row means open"
        );
        let target = first.target.as_ref().unwrap();
        assert_eq!(target.identity, "author");
        assert_eq!(target.sequence, 7);
        let page = response.page_info.unwrap();
        assert_eq!(page.end_cursor, "400");
        assert!(page.has_next_page);
        assert!(!page.has_previous_page);
    }

    #[tokio::test]
    async fn list_reports_rejects_a_bad_cursor() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(true)])
            .into_connection();
        let ctx = ctx(db).await.test_auth(MODERATOR).await;
        let err = list_reports::handle(
            ctx,
            ListReportsRequest {
                limit: None,
                after: Some("not-a-number".into()),
                status: 0,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn resolve_report_requires_a_status() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(true)])
            .into_connection();
        let ctx = ctx(db).await.test_auth(MODERATOR).await;
        let err = resolve_report::handle(
            ctx,
            ResolveReportRequest {
                report_id: 1,
                status: ReportStatus::Unspecified as i32,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
    }

    #[tokio::test]
    async fn resolve_report_upserts_the_decision() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(true)])
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();
        let ctx = ctx(db.clone()).await.test_auth(MODERATOR).await;
        resolve_report::handle(
            ctx,
            ResolveReportRequest {
                report_id: 42,
                status: ReportStatus::Dismissed as i32,
            },
        )
        .await
        .unwrap();

        let log = format!("{:?}", db.into_transaction_log());
        assert!(log.contains("report_resolution"), "{log}");
        assert!(log.contains("ON CONFLICT"), "{log}");
    }

    #[tokio::test]
    async fn delete_content_rejects_non_moderators() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(false)])
            .into_connection();
        let ctx = ctx(db).await.test_auth("someone").await;
        let err = delete_content::handle(
            ctx,
            DeleteContentRequest {
                target: Some(common::event_key(2, "author", 1, &[1, 2, 3], 7)),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::PermissionDenied);
    }

    #[tokio::test]
    async fn delete_content_requires_a_target() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([moderator_rows(true)])
            .into_connection();
        let ctx = ctx(db).await.test_auth(MODERATOR).await;
        let err =
            delete_content::handle(ctx, DeleteContentRequest { target: None })
                .await
                .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
    }
}
