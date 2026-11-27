use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "ALTER TABLE identity_audit_log DROP CONSTRAINT IF EXISTS action_performed_by RESTRICT",
        )
        .await?;
        tx.execute_unprepared("ALTER TABLE identity_audit_log ADD COLUMN IF NOT EXISTS by SMALLINT") .await?;

        // If `by_identity` and `by_public_key` are not null use `PerformedBy::Identity` else `System`.
        tx.execute_unprepared("UPDATE identity_audit_log SET by = CASE WHEN (((by_identity IS NOT NULL) AND (by_public_key IS NOT NULL))) THEN 3 ELSE 1 END WHERE by IS NULL") .await?;

        tx.execute_unprepared(
            "ALTER TABLE identity_audit_log ALTER COLUMN by SET NOT NULL",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(
            "ALTER TABLE identity_audit_log DROP COLUMN IF EXISTS by",
        )
        .await?;
        tx.execute_unprepared("ALTER TABLE identity_audit_log ADD CONSTRAINT action_performed_by CHECK (((by_identity IS NOT NULL) OR (by_public_key IS NOT NULL)))") .await?;
        Ok(())
    }
}
