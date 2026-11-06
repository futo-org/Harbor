//! Switch search_posts to use the pg_search extension.
//!
//! NOTE: we don't delete the old search_data column or index to make rolling
//! back quicker. Once we're happy with pg_search we can remove this.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const INDEX_NAME: &str = "content_post_search";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        // We use ASCII folding to remove accents, e.g. turning "café" info
        // "cafe". We also use an English stemmer allow searching of variants of
        // the same words, e.g. "running", "runs" and "run" are all turn into
        // "run" and thus match when searching "run" or "running" (if it uses
        // the same stemming).
        tx.execute_unprepared(&format!(
            "CREATE INDEX {INDEX_NAME} ON content_post USING paradedb ((text::pdb.icu('ascii_folding=true', 'stemmer=english')))",
        ))
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(&format!("DROP INDEX {INDEX_NAME}"))
            .await?;
        Ok(())
    }
}
