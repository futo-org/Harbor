use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

// Make `sync-legacy` incremental: each cached row carries the legacy event id
// it came from, the caches get natural-key unique indexes so re-reads upsert,
// and `legacy_sync_state` holds the high-water mark of the last full sync.
const UP: &[&str] = &[
    "ALTER TABLE legacy_events_cache ADD COLUMN IF NOT EXISTS legacy_id bigint",
    "CREATE UNIQUE INDEX IF NOT EXISTS legacy_events_cache_legacy_id \
        ON legacy_events_cache (legacy_id)",
    "ALTER TABLE legacy_opinions_cache ADD COLUMN IF NOT EXISTS event_id bigint",
    "CREATE UNIQUE INDEX IF NOT EXISTS legacy_opinions_cache_target \
        ON legacy_opinions_cache (kind, system_key, subject, t_system_key, t_process, t_logical_clock) \
        NULLS NOT DISTINCT",
    "CREATE TABLE IF NOT EXISTS legacy_sync_state (\
        key text PRIMARY KEY, value bigint NOT NULL)",
];

const DOWN: &[&str] = &[
    "DROP TABLE IF EXISTS legacy_sync_state",
    "DROP INDEX IF EXISTS legacy_opinions_cache_target",
    "ALTER TABLE legacy_opinions_cache DROP COLUMN IF EXISTS event_id",
    "DROP INDEX IF EXISTS legacy_events_cache_legacy_id",
    "ALTER TABLE legacy_events_cache DROP COLUMN IF EXISTS legacy_id",
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for sql in UP {
            manager.get_connection().execute_unprepared(sql).await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for sql in DOWN {
            manager.get_connection().execute_unprepared(sql).await?;
        }
        Ok(())
    }
}
