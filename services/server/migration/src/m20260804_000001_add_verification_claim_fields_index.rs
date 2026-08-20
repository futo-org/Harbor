//! GIN index on `content_verification_claim.fields` so the reverse claim
//! search (`fields @> $1`) is index-backed. `jsonb_path_ops` is the smaller,
//! faster operator class for containment queries.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "CREATE INDEX IF NOT EXISTS \
                 content_verification_claim_fields_gin \
                 ON content_verification_claim \
                 USING gin (fields jsonb_path_ops)",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "DROP INDEX IF EXISTS content_verification_claim_fields_gin",
            )
            .await?;
        Ok(())
    }
}
