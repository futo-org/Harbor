//! `report_resolution`: a moderator's decision on a report, keyed by
//! `content_report.content_id`. No row means open.

use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("report_resolution"))
                    .if_not_exists()
                    .col(big_integer(Alias::new("content_id")).primary_key())
                    // `ReportStatus` enum value.
                    .col(small_integer(Alias::new("status")))
                    .col(string(Alias::new("resolved_by")))
                    .col(
                        timestamp_with_time_zone(Alias::new("resolved_at"))
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-report_resolution-content_id")
                            .from(
                                Alias::new("report_resolution"),
                                Alias::new("content_id"),
                            )
                            .to(Alias::new("content"), Alias::new("id"))
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(Alias::new("report_resolution"))
                    .to_owned(),
            )
            .await
    }
}
