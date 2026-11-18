use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const DROP_TABLE: &str = "DROP TABLE IF EXISTS content_image";

const NEW_TABLE: &str = "
CREATE TABLE IF NOT EXISTS content_image (
    content_id BIGINT NOT NULL,
    digest_type INTEGER NOT NULL,
    digest_bytes BYTEA NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL
);
";

const OLD_TABLE: &str = "
CREATE TABLE IF NOT EXISTS content_image (
    content_id bigint PRIMARY KEY,
    blob_digest_type smallint NOT NULL,
    blob_digest_bytes bytea NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL
);
";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        // Old table was unused, so drop it and recreate it. Will be filled in a
        // future migration.
        tx.execute_unprepared(DROP_TABLE).await?;
        tx.execute_unprepared(NEW_TABLE).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(DROP_TABLE).await?;
        tx.execute_unprepared(OLD_TABLE).await?;

        Ok(())
    }
}
