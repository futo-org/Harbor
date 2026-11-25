use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS identity_audit_log (
                id BIGSERIAL PRIMARY KEY,
                identity TEXT NOT NULL,
                action SMALLINT NOT NULL,
                by_identity TEXT NULL,
                by_public_key TEXT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT action_performed_by CHECK(by_identity IS NOT NULL OR by_public_key IS NOT NULL)
            )",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP TABLE IF EXISTS identity_audit_log")
            .await?;

        Ok(())
    }
}
