use ::entity::{content, content_report, event, report_resolution};
use polycentric_common::models::collections;
use sea_orm::prelude::{DateTimeUtc, DateTimeWithTimeZone};
use sea_orm::sea_query::{
    Expr, ExprTrait, Func, InsertStatement, OnConflict, Order, PgFunc,
    Query as SeaQuery, SelectStatement,
};
use sea_orm::*;

use crate::service::events::TargetEventKey;
use crate::service::proto::ReportStatus;

/// One distinct report with how often it was filed and its resolution.
#[derive(Debug, Clone, FromQueryResult)]
pub struct ReportRow {
    pub content_id: i64,
    pub category: i16,
    pub additional_info: String,
    pub event_key_collection: i16,
    pub event_key_identity: String,
    pub event_key_public_key_type: i16,
    pub event_key_public_key: Vec<u8>,
    pub event_key_sequence: i64,
    pub report_count: i64,
    /// Newest report event, the paging cursor.
    pub latest_event_id: i64,
    pub latest_reported_at: DateTimeWithTimeZone,
    pub reporters: Vec<String>,
    pub status: Option<i16>,
    pub resolved_by: Option<String>,
    pub resolved_at: Option<DateTimeUtc>,
}

/// Reporters listed per report; the count covers the rest.
const REPORTERS_SHOWN: usize = 5;

const LATEST_EVENT_ID: &str = "latest_event_id";

pub struct Query;

impl Query {
    /// Oldest first. `after` is the previous page's last `latest_event_id`;
    /// `status` keeps one `ReportStatus`, open being no resolution row.
    #[tracing::instrument(skip_all)]
    pub async fn list_reports<C: ConnectionTrait>(
        db: &C,
        limit: u64,
        after: Option<i64>,
        status: Option<i16>,
    ) -> Result<Vec<ReportRow>, DbErr> {
        let query = list_reports_query(limit, after, status);
        let mut rows = ReportRow::find_by_statement(
            db.get_database_backend().build(&query),
        )
        .all(db)
        .await?;
        for row in &mut rows {
            row.reporters.truncate(REPORTERS_SHOWN);
        }
        Ok(rows)
    }
}

fn list_reports_query(
    limit: u64,
    after: Option<i64>,
    status: Option<i16>,
) -> SelectStatement {
    let event_id = Expr::col((event::Entity, event::Column::Id));
    let resolution_status = Expr::col((
        report_resolution::Entity,
        report_resolution::Column::Status,
    ));

    let mut query = SeaQuery::select();
    query
        .columns([
            (content_report::Entity, content_report::Column::ContentId),
            (content_report::Entity, content_report::Column::Category),
            (
                content_report::Entity,
                content_report::Column::AdditionalInfo,
            ),
            (
                content_report::Entity,
                content_report::Column::EventKeyCollection,
            ),
            (
                content_report::Entity,
                content_report::Column::EventKeyIdentity,
            ),
            (
                content_report::Entity,
                content_report::Column::EventKeyPublicKeyType,
            ),
            (
                content_report::Entity,
                content_report::Column::EventKeyPublicKey,
            ),
            (
                content_report::Entity,
                content_report::Column::EventKeySequence,
            ),
        ])
        .expr_as(Func::count(event_id.clone()), "report_count")
        .expr_as(Func::max(event_id.clone()), LATEST_EVENT_ID)
        .expr_as(
            Func::max(Expr::col((event::Entity, event::Column::CreatedAt))),
            "latest_reported_at",
        )
        .expr_as(
            PgFunc::array_agg_distinct(Expr::col((
                event::Entity,
                event::Column::Identity,
            ))),
            "reporters",
        )
        .columns([
            (report_resolution::Entity, report_resolution::Column::Status),
            (
                report_resolution::Entity,
                report_resolution::Column::ResolvedBy,
            ),
            (
                report_resolution::Entity,
                report_resolution::Column::ResolvedAt,
            ),
        ])
        .from(content_report::Entity)
        .inner_join(
            content::Entity,
            Expr::col((content::Entity, content::Column::Id)).equals((
                content_report::Entity,
                content_report::Column::ContentId,
            )),
        )
        .inner_join(
            event::Entity,
            Expr::col((event::Entity, event::Column::ContentDigestType))
                .equals((content::Entity, content::Column::DigestType))
                .and(
                    Expr::col((
                        event::Entity,
                        event::Column::ContentDigestBytes,
                    ))
                    .equals((content::Entity, content::Column::DigestBytes)),
                )
                .and(
                    Expr::col((event::Entity, event::Column::Collection))
                        .eq(collections::REPORTS as i16),
                ),
        )
        .left_join(
            report_resolution::Entity,
            Expr::col((
                report_resolution::Entity,
                report_resolution::Column::ContentId,
            ))
            .equals((
                content_report::Entity,
                content_report::Column::ContentId,
            )),
        )
        .group_by_col((
            content_report::Entity,
            content_report::Column::ContentId,
        ))
        .group_by_col((
            report_resolution::Entity,
            report_resolution::Column::Status,
        ))
        .group_by_col((
            report_resolution::Entity,
            report_resolution::Column::ResolvedBy,
        ))
        .group_by_col((
            report_resolution::Entity,
            report_resolution::Column::ResolvedAt,
        ))
        .order_by(LATEST_EVENT_ID, Order::Asc)
        .limit(limit);
    if let Some(status) = status {
        query.and_where(
            Func::coalesce([
                resolution_status,
                Expr::val(ReportStatus::Open as i16),
            ])
            .eq(status),
        );
    }
    if let Some(after) = after {
        query.and_having(Func::max(event_id).gt(after));
    }
    query
}

pub struct Mutation;

impl Mutation {
    #[tracing::instrument(skip_all)]
    pub async fn resolve_report<C: ConnectionTrait>(
        db: &C,
        content_id: i64,
        status: i16,
        moderator: &str,
    ) -> Result<(), DbErr> {
        report_resolution::Entity::insert(report_resolution::ActiveModel {
            content_id: Set(content_id),
            status: Set(status),
            resolved_by: Set(moderator.to_string()),
            resolved_at: Set(chrono::Utc::now()),
        })
        .on_conflict(resolution_upsert())
        .exec_without_returning(db)
        .await?;
        Ok(())
    }

    /// After the event at `key` was deleted.
    #[tracing::instrument(skip_all)]
    pub async fn resolve_reports_on_target<C: ConnectionTrait>(
        db: &C,
        key: &TargetEventKey,
        moderator: &str,
    ) -> Result<(), DbErr> {
        let reports = Condition::all()
            .add(content_report::Column::EventKeyCollection.eq(key.collection))
            .add(
                content_report::Column::EventKeyIdentity
                    .eq(key.identity.clone()),
            )
            .add(
                content_report::Column::EventKeyPublicKeyType
                    .eq(key.public_key_type),
            )
            .add(
                content_report::Column::EventKeyPublicKey
                    .eq(key.public_key.clone()),
            )
            .add(content_report::Column::EventKeySequence.eq(key.sequence));
        db.execute(&resolve_matching(reports, moderator)?).await?;
        Ok(())
    }

    /// After `author` was banned.
    #[tracing::instrument(skip_all)]
    pub async fn resolve_reports_by_author<C: ConnectionTrait>(
        db: &C,
        author: &str,
        moderator: &str,
    ) -> Result<(), DbErr> {
        let reports = Condition::all()
            .add(content_report::Column::EventKeyIdentity.eq(author));
        db.execute(&resolve_matching(reports, moderator)?).await?;
        Ok(())
    }
}

/// Marks every report matching `reports` resolved by `moderator`. The post
/// is gone, so any earlier decision is replaced.
fn resolve_matching(
    reports: Condition,
    moderator: &str,
) -> Result<InsertStatement, DbErr> {
    let mut decisions = SeaQuery::select();
    decisions
        .column(content_report::Column::ContentId)
        .expr(Expr::val(ReportStatus::Resolved as i16))
        .expr(Expr::val(moderator.to_string()))
        .expr(Expr::current_timestamp())
        .from(content_report::Entity)
        .cond_where(reports);

    let mut insert = SeaQuery::insert();
    insert
        .into_table(report_resolution::Entity)
        .columns([
            report_resolution::Column::ContentId,
            report_resolution::Column::Status,
            report_resolution::Column::ResolvedBy,
            report_resolution::Column::ResolvedAt,
        ])
        .select_from(decisions)
        .map_err(|e| DbErr::Custom(format!("resolve reports insert: {e}")))?
        .on_conflict(resolution_upsert());
    Ok(insert)
}

fn resolution_upsert() -> OnConflict {
    OnConflict::column(report_resolution::Column::ContentId)
        .update_columns([
            report_resolution::Column::Status,
            report_resolution::Column::ResolvedBy,
            report_resolution::Column::ResolvedAt,
        ])
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::sea_query::PostgresQueryBuilder;

    #[test]
    fn list_reports_groups_per_report_and_pages_on_the_newest_event() {
        let (sql, values) = list_reports_query(10, Some(400), Some(1))
            .build(PostgresQueryBuilder);
        println!("{sql}\n{values:?}");
        assert!(sql.contains(r#"COUNT("events"."id") AS "report_count""#));
        assert!(sql.contains(r#"MAX("events"."id") AS "latest_event_id""#));
        assert!(sql.contains(r#"ARRAY_AGG(DISTINCT "events"."identity")"#));
        assert!(sql.contains(r#"LEFT JOIN "report_resolution""#));
        assert!(sql.contains(r#"COALESCE("report_resolution"."status", $"#));
        assert!(sql.contains(r#"HAVING MAX("events"."id") > $"#));
        assert!(sql.contains(r#"ORDER BY "latest_event_id" ASC LIMIT $"#));
    }

    #[test]
    fn list_reports_without_filters_has_no_where_or_having() {
        let (sql, _) =
            list_reports_query(10, None, None).build(PostgresQueryBuilder);
        assert!(!sql.contains("WHERE"), "{sql}");
        assert!(!sql.contains("HAVING"), "{sql}");
    }

    #[test]
    fn resolve_matching_upserts_from_the_report_rows() {
        let reports = Condition::all()
            .add(content_report::Column::EventKeyIdentity.eq("author"));
        let (sql, values) = resolve_matching(reports, "moderator")
            .unwrap()
            .build(PostgresQueryBuilder);
        println!("{sql}\n{values:?}");
        assert!(sql.starts_with(r#"INSERT INTO "report_resolution""#));
        assert!(sql.contains(r#"FROM "content_report" WHERE"#));
        assert!(sql.contains(
            r#"ON CONFLICT ("content_id") DO UPDATE SET "status" = "excluded"."status""#
        ));
    }
}
