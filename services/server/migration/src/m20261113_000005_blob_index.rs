use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "
            CREATE TABLE IF NOT EXISTS blob_index (
              key           TEXT        PRIMARY KEY,
              digest_type   SMALLINT    NOT NULL,
              digest_value  BYTEA       NOT NULL,
              size          BIGINT      NOT NULL,
              last_modified TIMESTAMPTZ NOT NULL
            )",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP TABLE IF EXISTS blob_index")
            .await?;

        Ok(())
    }
}
