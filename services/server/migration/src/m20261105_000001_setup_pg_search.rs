//! Used to set up the pg_search extension.
//!
//! Community pg_search cannot replicate to standbys, so this no longer does
//! anything; m20261106_000001_drop_pg_search removes it where it was applied.

use sea_orm::Statement;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }

    // Still cleans up after the original version of this migration.
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP EXTENSION IF EXISTS pg_search")
            .await?;
        tx.execute_unprepared("DROP SCHEMA IF EXISTS paradedb")
            .await?;
        let db_name: String = tx
            .query_one_raw(Statement::from_string(
                tx.get_database_backend(),
                "SELECT current_database()",
            ))
            .await?
            .ok_or_else(|| {
                DbErr::Custom("can't get current database".to_owned())
            })?
            .try_get_by(0)?;
        tx.execute_unprepared(&format!(
            "ALTER DATABASE {db_name} RESET paradedb.planner_warnings"
        ))
        .await?;
        Ok(())
    }
}
