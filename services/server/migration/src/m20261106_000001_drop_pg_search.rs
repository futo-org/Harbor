//! Drop pg_search again.
//!
//! The community edition refuses to replay its WAL on standbys, which takes
//! down every replica of the cluster as soon as the index is created.

use sea_orm::Statement;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const INDEX_NAME: &str = "content_post_search";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(&format!("DROP INDEX IF EXISTS {INDEX_NAME}"))
            .await?;
        tx.execute_unprepared("DROP EXTENSION IF EXISTS pg_search")
            .await?;
        let db_name = current_database(tx).await?;
        tx.execute_unprepared(&format!(
            "ALTER DATABASE {db_name} RESET paradedb.planner_warnings"
        ))
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(
            "CREATE EXTENSION IF NOT EXISTS pg_search CASCADE",
        )
        .await?;
        let db_name = current_database(tx).await?;
        tx.execute_unprepared(&format!(
            "ALTER DATABASE {db_name} SET paradedb.planner_warnings = 'off'"
        ))
        .await?;
        tx.execute_unprepared(&format!(
            "CREATE INDEX {INDEX_NAME} ON content_post USING paradedb ((text::pdb.icu('ascii_folding=true', 'stemmer=english')))",
        ))
        .await?;
        Ok(())
    }
}

async fn current_database(
    tx: &SchemaManagerConnection<'_>,
) -> Result<String, DbErr> {
    tx.query_one_raw(Statement::from_string(
        tx.get_database_backend(),
        "SELECT current_database()",
    ))
    .await?
    .ok_or_else(|| DbErr::Custom("can't get current database".to_owned()))?
    .try_get_by(0)
}
