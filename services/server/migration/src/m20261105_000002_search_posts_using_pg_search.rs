//! Used to create the pg_search index for search_posts.
//!
//! Community pg_search cannot replicate to standbys, so this no longer does
//! anything; m20261106_000001_drop_pg_search removes it where it was applied.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }

    // Still cleans up after the original version of this migration.
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared("DROP INDEX IF EXISTS content_post_search")
            .await?;
        Ok(())
    }
}
