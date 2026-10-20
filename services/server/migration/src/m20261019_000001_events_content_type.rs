use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Number of events updated per statement in the backfill.
const BATCH_SIZE: i64 = 100_000;

/// Matches the Explore feed, sorted by latest.
const CREATE_INDEX: &str = "CREATE INDEX CONCURRENTLY IF NOT EXISTS events_feed_posts_idx ON events (created_at DESC, id DESC) WHERE collection = 2 AND content_type = 2";

/// Sets `content_type` (see `content_types` in `polycentric_common`) based on
/// which `content_*` table has the event's content. Most common types first.
const FILL_COLUMN: &str = "UPDATE events SET content_type = CASE
    WHEN EXISTS (SELECT 1 FROM content_reaction t WHERE t.content_id = content.id) THEN 6
    WHEN EXISTS (SELECT 1 FROM content_follow t WHERE t.content_id = content.id) THEN 4
    WHEN EXISTS (SELECT 1 FROM content_post t WHERE t.content_id = content.id) THEN 2
    WHEN EXISTS (SELECT 1 FROM content_repost t WHERE t.content_id = content.id) THEN 9
    WHEN EXISTS (SELECT 1 FROM content_delete t WHERE t.content_id = content.id) THEN 3
    WHEN EXISTS (SELECT 1 FROM content_profile_update t WHERE t.content_id = content.id) THEN 7
    WHEN EXISTS (SELECT 1 FROM content_identity t WHERE t.content_id = content.id) THEN 8
    WHEN EXISTS (SELECT 1 FROM content_block t WHERE t.content_id = content.id) THEN 5
    WHEN EXISTS (SELECT 1 FROM content_label t WHERE t.content_id = content.id) THEN 11
    WHEN EXISTS (SELECT 1 FROM content_report t WHERE t.content_id = content.id) THEN 10
    WHEN EXISTS (SELECT 1 FROM content_verification_claim t WHERE t.content_id = content.id) THEN 12
    WHEN EXISTS (SELECT 1 FROM content_verification_verify t WHERE t.content_id = content.id) THEN 13
    WHEN EXISTS (SELECT 1 FROM content_verification_target t WHERE t.content_id = content.id) THEN 14
    WHEN EXISTS (SELECT 1 FROM content_attributed_to_reaction t WHERE t.content_id = content.id) THEN 15
END
FROM content
WHERE events.id BETWEEN {from} AND {to}
    AND events.content_type IS NULL
    AND content.digest_type = events.content_digest_type
    AND content.digest_bytes = events.content_digest_bytes";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    // Not in a transaction so the index can be built concurrently and the
    // backfill commits per batch. Every step is safe to rerun.
    fn use_transaction(&self) -> Option<bool> {
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        db.execute_unprepared(
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS content_type SMALLINT",
        )
        .await?;

        let mut select_range = SelectStatement::new();
        select_range
            .expr_as(Func::min(Expr::col("id")), "min")
            .expr_as(Func::max(Expr::col("id")), "max")
            .from("events");
        let range = db.query_one(&select_range).await?;
        if let Some(range) = range
            && let (Some(min), Some(max)) = (
                range.try_get::<Option<i64>>("", "min")?,
                range.try_get::<Option<i64>>("", "max")?,
            )
        {
            let mut from = min;
            while from <= max {
                let to = from + BATCH_SIZE - 1;
                let statement = FILL_COLUMN
                    .replace("{from}", &from.to_string())
                    .replace("{to}", &to.to_string());
                db.execute_unprepared(&statement).await?;
                from = to + 1;
            }
        }

        db.execute_unprepared(CREATE_INDEX).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared("DROP INDEX IF EXISTS events_feed_posts_idx")
            .await?;
        db.execute_unprepared(
            "ALTER TABLE events DROP COLUMN IF EXISTS content_type",
        )
        .await?;
        Ok(())
    }
}
