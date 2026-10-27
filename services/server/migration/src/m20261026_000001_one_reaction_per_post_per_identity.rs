use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const INDEX_NAME: &str = "reaction_post_identity_unique";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        // Delete duplicate reactions.
        tx.execute_unprepared("
            WITH
            duplicate_reaction AS (
              SELECT
                reaction.on_post,
                reaction.identity,
                trim_array(
                  -- Order such that the last created event is last in the array.
                  array_agg(reaction.event_id ORDER BY events.created_at ASC NULLS FIRST),
                  -- Remove the latest reaction (as we're going to keep it).
                  1
                ) AS event_ids
              FROM reaction
              LEFT JOIN events ON reaction.event_id = events.id
              GROUP BY reaction.on_post, reaction.identity
              -- Only duplicates.
              HAVING COUNT(*) > 1
            ),
            deleted_reaction AS (
              DELETE FROM reaction
              USING duplicate_reaction
              WHERE reaction.on_post = duplicate_reaction.on_post
                AND reaction.identity = duplicate_reaction.identity
                AND reaction.event_id = ANY(duplicate_reaction.event_ids)
              RETURNING reaction.on_post, reaction.positive
            ),
            grouped_interaction_changes AS (
              SELECT
                deleted_reaction.on_post AS event_id,
                SUM(CASE WHEN reaction.positive THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN reaction.positive THEN 0 ELSE 1 END) AS negative_count
              FROM deleted_reaction
              LEFT JOIN reaction ON reaction.on_post = deleted_reaction.on_post
              GROUP BY deleted_reaction.on_post
            )
            UPDATE interaction_tally SET
              reaction_positive_count = grouped_interaction_changes.positive_count,
              reaction_negative_count = grouped_interaction_changes.negative_count,
              decayed_count = decay_interaction_count(
                grouped_interaction_changes.positive_count
                  + reply_count
                  + repost_count
                  + quote_count,
                events.created_at
              )
            FROM grouped_interaction_changes, events
            WHERE interaction_tally.event_id = grouped_interaction_changes.event_id
              AND interaction_tally.event_id = events.id
        ").await?;

        tx.execute_unprepared(&format!("CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_NAME} ON reaction (on_post, identity)"))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        tx.execute_unprepared(&format!("DROP INDEX IF EXISTS {INDEX_NAME}"))
            .await?;
        Ok(())
    }
}
