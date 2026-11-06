//! Setup the pg_search extension.

use sea_orm::Statement;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(
            "CREATE EXTENSION IF NOT EXISTS pg_search CASCADE",
        )
        .await?;
        let db_name: String = tx
            .query_one_raw(Statement::from_string(
                tx.get_database_backend(),
                "SELECT current_database()",
            ))
            .await?
            .ok_or_else(|| {
                DbErr::Custom(format!("can't get current database"))
            })?
            .try_get_by(0)?;
        tx.execute_unprepared(&format!(
            "ALTER DATABASE {db_name} SET paradedb.planner_warnings = 'off'"
        ))
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP EXTENSION IF EXISTS pg_search")
            .await?;
        tx.execute_unprepared("DROP EXTENSION IF EXISTS vector")
            .await?;
        tx.execute_unprepared("DROP SCHEMA paradedb").await?;
        Ok(())
    }
}
