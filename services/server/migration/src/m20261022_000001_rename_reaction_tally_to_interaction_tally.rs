use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        let queries = &[
            // Rename the table, all constraints and indices to match.
            "ALTER TABLE IF EXISTS reaction_tally RENAME TO interaction_tally",
            "ALTER TABLE IF EXISTS interaction_tally RENAME CONSTRAINT reaction_tally_event_id_not_null TO interaction_tally_event_id_not_null",
            "ALTER TABLE IF EXISTS interaction_tally RENAME CONSTRAINT reaction_tally_positive_count_not_null TO interaction_tally_reaction_positive_count_not_null",
            "ALTER TABLE IF EXISTS interaction_tally RENAME CONSTRAINT reaction_tally_negative_count_not_null TO interaction_tally_reaction_negative_count_not_null",
            "ALTER TABLE IF EXISTS interaction_tally RENAME CONSTRAINT reaction_tally_decayed_count_not_null TO interaction_tally_decayed_count_not_null",
            "ALTER TABLE IF EXISTS interaction_tally RENAME CONSTRAINT reaction_tally_pkey TO interaction_tally_pkey",
            "ALTER INDEX IF EXISTS reaction_tally_decayed_count RENAME TO interaction_tally_decayed_count",
            "ALTER INDEX IF EXISTS reaction_tally_decayed_count_update RENAME TO interaction_tally_decayed_count_update",
            // Prefix the count columns with reaction since we'll have more
            // counters.
            "ALTER TABLE IF EXISTS interaction_tally RENAME COLUMN positive_count TO reaction_positive_count",
            "ALTER TABLE IF EXISTS interaction_tally RENAME COLUMN negative_count TO reaction_negative_count",
        ];
        for query in queries {
            tx.execute_unprepared(query).await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        let queries = &[
            "ALTER TABLE IF EXISTS interaction_tally RENAME TO reaction_tally",
            "ALTER TABLE IF EXISTS reaction_tally RENAME CONSTRAINT interaction_tally_event_id_not_null TO reaction_tally_event_id_not_null",
            "ALTER TABLE IF EXISTS reaction_tally RENAME CONSTRAINT interaction_tally_reaction_positive_count_not_null TO reaction_tally_positive_count_not_null",
            "ALTER TABLE IF EXISTS reaction_tally RENAME CONSTRAINT interaction_tally_reaction_negative_count_not_null TO reaction_tally_negative_count_not_null",
            "ALTER TABLE IF EXISTS reaction_tally RENAME CONSTRAINT interaction_tally_decayed_count_not_null TO reaction_tally_decayed_count_not_null",
            "ALTER TABLE IF EXISTS reaction_tally RENAME CONSTRAINT interaction_tally_pkey TO reaction_tally_pkey",
            "ALTER INDEX IF EXISTS interaction_tally_decayed_count RENAME TO reaction_tally_decayed_count",
            "ALTER INDEX IF EXISTS interaction_tally_decayed_count_update RENAME TO reaction_tally_decayed_count_update",
            "ALTER TABLE IF EXISTS reaction_tally RENAME COLUMN reaction_positive_count TO positive_count",
            "ALTER TABLE IF EXISTS reaction_tally RENAME COLUMN reaction_negative_count TO negative_count",
        ];
        for query in queries {
            tx.execute_unprepared(query).await?;
        }

        Ok(())
    }
}
