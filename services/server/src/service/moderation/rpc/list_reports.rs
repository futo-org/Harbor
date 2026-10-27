//! `list_reports`: a page of this server's reports, oldest first.

use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::identity::rpc::common::require_moderator;
use crate::service::moderation::repository::{self, ReportRow};
use crate::service::moderation::rpc::common::{
    decode_cursor, event_key, page_info, page_limit,
};
use crate::service::proto::{
    ListReportsRequest, ListReportsResponse, ReportStatus, ReportSummary,
};

pub async fn handle(
    ctx: AuthContext,
    req: ListReportsRequest,
) -> Result<ListReportsResponse, Status> {
    require_moderator(&ctx).await?;

    let limit = page_limit(req.limit);
    let after = decode_cursor(req.after.as_deref())?;
    let status = match req.status() {
        ReportStatus::Unspecified => None,
        status => Some(status as i16),
    };

    // Over-fetch one to detect a following page.
    let mut rows =
        repository::Query::list_reports(&ctx.db, limit + 1, after, status)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "list_reports db error");
                Status::internal("internal server error")
            })?;
    let has_next_page = rows.len() > limit as usize;
    rows.truncate(limit as usize);

    let cursors: Vec<i64> = rows.iter().map(|r| r.latest_event_id).collect();
    Ok(ListReportsResponse {
        reports: rows.into_iter().map(summary).collect(),
        page_info: Some(page_info(&cursors, after.is_some(), has_next_page)),
    })
}

fn summary(row: ReportRow) -> ReportSummary {
    ReportSummary {
        report_id: row.content_id,
        target: Some(event_key(
            row.event_key_collection,
            &row.event_key_identity,
            row.event_key_public_key_type,
            &row.event_key_public_key,
            row.event_key_sequence,
        )),
        category: row.category as i32,
        additional_info: row.additional_info,
        report_count: row.report_count as u32,
        reporters: row.reporters,
        latest_reported_at: row.latest_reported_at.timestamp_millis(),
        status: row.status.unwrap_or(ReportStatus::Open as i16) as i32,
        resolved_by: row.resolved_by.unwrap_or_default(),
        resolved_at: row.resolved_at.map(|t| t.timestamp_millis()).unwrap_or(0),
    }
}
