use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("
            CREATE TABLE IF NOT EXISTS blob_prune_prefix (
              prefix       TEXT        PRIMARY KEY CHECK ( octet_length(prefix) >= 1 AND octet_length(prefix) <= 4 ),
              last_checked TIMESTAMPTZ NOT NULL
            )
        ").await?;

        // Insert 0-9, a-f.
        //
        // If we want more concurrency we can replace it with 00-99, aa-ff.
        tx.execute_unprepared(
            "
            INSERT INTO blob_prune_prefix (prefix, last_checked)
            SELECT prefix, CURRENT_TIMESTAMP
            FROM (
                SELECT prefix::TEXT
                FROM generate_series(0, 9, 1) AS d(prefix)
                UNION ALL
                SELECT chr(ascii('a') + off)
                FROM generate_series(0, 5, 1) AS d(off)
            ) AS d(prefix)
        ",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP TABLE IF EXISTS blob_prune_prefix")
            .await?;

        Ok(())
    }
}
