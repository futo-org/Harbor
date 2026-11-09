//! Used to set up the pg_search extension.
//!
//! Community pg_search cannot replicate to standbys, so this no longer does
//! anything; m20261106_000001_drop_pg_search removes it where it was applied.

use sea_orm_migration::prelude::*;

use super::m20261106_000001_drop_pg_search::reset_planner_warnings;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }

    // Still cleans up after the original version of this migration. The
    // extension is owned by the cluster, not by the app role.
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        reset_planner_warnings(manager.get_connection()).await
    }
}
