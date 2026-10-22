use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const FILL_QUERY: &str = "
WITH
reply_count AS (
  SELECT post, COUNT(*) AS count
  FROM reply
  GROUP BY post
),
repost_count AS (
  SELECT post, COUNT(*) AS count
  FROM repost
  GROUP BY post
),
quote_count AS (
  SELECT post, COUNT(*) AS count
  FROM quote
  GROUP BY post
)
UPDATE interaction_tally SET
  reply_count = COALESCE((SELECT count FROM reply_count WHERE post = interaction_tally.event_id), 0),
  repost_count = COALESCE((SELECT count FROM repost_count WHERE post = interaction_tally.event_id), 0),
  quote_count = COALESCE((SELECT count FROM quote_count WHERE post = interaction_tally.event_id), 0)
";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        let queries = &[
            "ALTER TABLE IF EXISTS interaction_tally ADD COLUMN IF NOT EXISTS reply_count BIGINT",
            "ALTER TABLE IF EXISTS interaction_tally ADD COLUMN IF NOT EXISTS repost_count BIGINT",
            "ALTER TABLE IF EXISTS interaction_tally ADD COLUMN IF NOT EXISTS quote_count BIGINT",
            FILL_QUERY,
            "ALTER TABLE IF EXISTS interaction_tally ALTER COLUMN reply_count SET NOT NULL",
            "ALTER TABLE IF EXISTS interaction_tally ALTER COLUMN repost_count SET NOT NULL",
            "ALTER TABLE IF EXISTS interaction_tally ALTER COLUMN quote_count SET NOT NULL",
        ];
        for query in queries {
            tx.execute_unprepared(query).await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        let queries = &[
            "ALTER TABLE IF EXISTS interaction_tally DROP COLUMN IF EXISTS reply_count",
            "ALTER TABLE IF EXISTS interaction_tally DROP COLUMN IF EXISTS repost_count",
            "ALTER TABLE IF EXISTS interaction_tally DROP COLUMN IF EXISTS quote_count",
        ];
        for query in queries {
            tx.execute_unprepared(query).await?;
        }

        Ok(())
    }
}
