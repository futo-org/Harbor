//! Drop the unused `content_post.search_data` column and related index.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP INDEX content_post_search_data")
            .await?;

        tx.execute_unprepared(
            "ALTER TABLE content_post DROP COLUMN search_data",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("ALTER TABLE content_post ADD COLUMN search_data tsvector GENERATED ALWAYS AS (create_tsvector('english'::regconfig, (text)::text, 'A'::\"char\")) STORED NOT NULL").await?;

        tx.execute_unprepared("CREATE INDEX content_post_search_data ON content_post USING gin (search_data)") .await?;
        Ok(())
    }
}
