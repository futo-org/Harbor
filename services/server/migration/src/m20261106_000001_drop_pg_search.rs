//! Drop pg_search again.
//!
//! The community edition refuses to replay its WAL on standbys, which takes
//! down every replica of the cluster as soon as the index is created. The
//! migrations that set it up are no-ops now, this cleans up where they ran.

use sea_orm::Statement;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP INDEX IF EXISTS content_post_search")
            .await?;
        tx.execute_unprepared("DROP EXTENSION IF EXISTS pg_search")
            .await?;
        // The extension's schema is not a member of it, so it survives the drop.
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

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
