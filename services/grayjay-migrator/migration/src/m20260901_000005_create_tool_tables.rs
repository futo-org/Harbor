use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

// Working tables of the `grayjay-migrate` tool. Earlier tool builds created
// them at runtime, hence IF NOT EXISTS throughout.
const UP: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS legacy_events_cache (\
        system_key bytea NOT NULL, raw_event bytea NOT NULL, \
        moderation_status text, moderation_tags text)",
    "CREATE INDEX IF NOT EXISTS legacy_events_cache_sk ON legacy_events_cache (system_key)",
    "CREATE TABLE IF NOT EXISTS legacy_opinions_cache (\
        kind text NOT NULL, system_key bytea NOT NULL, value bytea NOT NULL, \
        ts bigint NOT NULL, subject bytea, t_system_key bytea, \
        t_process bytea, t_logical_clock bigint)",
    "CREATE INDEX IF NOT EXISTS legacy_opinions_cache_sk ON legacy_opinions_cache (system_key)",
    "CREATE TABLE IF NOT EXISTS url_info_cache (\
        url text PRIMARY KEY, title text NOT NULL DEFAULT '', \
        description text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '')",
    "CREATE TABLE IF NOT EXISTS authored_bundle (\
        legacy_system_key text NOT NULL, ord int NOT NULL, bundle bytea NOT NULL, \
        pushed boolean NOT NULL DEFAULT false, \
        PRIMARY KEY (legacy_system_key, ord))",
    "ALTER TABLE authored_bundle ADD COLUMN IF NOT EXISTS pushed boolean NOT NULL DEFAULT false",
    "CREATE INDEX IF NOT EXISTS authored_bundle_unpushed \
        ON authored_bundle (legacy_system_key) WHERE NOT pushed",
    "CREATE TABLE IF NOT EXISTS migrated_chain (\
        legacy_system_key text NOT NULL, collection int NOT NULL, \
        last_sequence bigint NOT NULL, last_signature bytea NOT NULL, \
        merkle_peaks bytea NOT NULL, \
        PRIMARY KEY (legacy_system_key, collection))",
];

const DOWN: &[&str] = &[
    "DROP TABLE IF EXISTS migrated_chain",
    "DROP TABLE IF EXISTS authored_bundle",
    "DROP TABLE IF EXISTS url_info_cache",
    "DROP TABLE IF EXISTS legacy_opinions_cache",
    "DROP TABLE IF EXISTS legacy_events_cache",
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
