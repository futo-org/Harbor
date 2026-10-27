//! `resolve_report`: records a moderator's decision on a report.

use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::moderation::repository;
use crate::service::proto::{
    ReportStatus, ResolveReportRequest, ResolveReportResponse,
};

pub async fn handle(
    ctx: AuthContext,
    req: ResolveReportRequest,
) -> Result<ResolveReportResponse, Status> {
    require_moderator(&ctx).await?;
    let status = match req.status() {
        ReportStatus::Unspecified => {
            return Err(Status::invalid_argument("status is required"));
        }
        status => status as i16,
    };

    repository::Mutation::resolve_report(
        &ctx.db,
        req.report_id,
        status,
        ctx.identity(),
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "resolve_report db error");
        Status::internal("internal server error")
    })?;

    tracing::info!(
        moderator = ctx.identity(),
        report_id = req.report_id,
        status,
        "report status changed"
    );
    Ok(ResolveReportResponse {})
}
