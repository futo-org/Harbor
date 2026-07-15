//! Creates the `identity_flag` table: server-administered flags on an
//! identity (e.g. "moderator", "banned"), one row per identity+flag pair.
//! Columns are spelled out here (rather than derived from the entity) so
//! this migration is a fixed snapshot that never drifts as
//! `entity::identity_flag_model` evolves. `IF NOT EXISTS` keeps it a no-op
//! on a database that already has the table.

use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("identity_flag"))
                    .if_not_exists()
                    // sha256 hash of the initial Identity content; matches
                    // `content_identity.identity`.
                    .col(string(Alias::new("identity")))
                    .col(string(Alias::new("flag")))
                    .col(
                        timestamp_with_time_zone(Alias::new("created_at"))
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        timestamp_with_time_zone(Alias::new("updated_at"))
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(Alias::new("identity"))
                            .col(Alias::new("flag")),
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
                    .table(Alias::new("identity_flag"))
                    .to_owned(),
            )
            .await
    }
}
