//! Index to support `list_events`.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const NAME: &str = "events_identity_sequence";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(&format!(
            "CREATE INDEX IF NOT EXISTS {NAME} ON events (identity, sequence DESC)"
        ))
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(&format!("DROP INDEX IF EXISTS {NAME}"))
            .await?;
        Ok(())
    }
}
