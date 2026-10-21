use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        // Analyze the maximum amount of rows.
        tx.execute_unprepared("SET default_statistics_target = 10000")
            .await?;

        // Analyze all tables.
        tx.execute_unprepared("ANALYZE (BUFFER_USAGE_LIMIT '1GB')")
            .await?;

        Ok(())
    }

    async fn down(&self, _: &SchemaManager) -> Result<(), DbErr> {
        Ok(()) // Nothing to do.
    }
}
