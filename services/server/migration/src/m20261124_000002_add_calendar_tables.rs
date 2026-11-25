//! Calendar event and RSVP tables

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS content_calendar_event (
                content_id bigint PRIMARY KEY,
                title text NOT NULL,
                description text,
                start_at timestamp with time zone NOT NULL,
                end_at timestamp with time zone,
                all_day boolean NOT NULL,
                location_name text,
                location_address text,
                latitude double precision,
                longitude double precision,
                search_data tsvector GENERATED ALWAYS AS (
                    create_tsvector(
                        title
                        || ' ' || COALESCE(description, '')
                        || ' ' || COALESCE(location_name, '')
                        || ' ' || COALESCE(location_address, '')
                    )
                ) STORED NOT NULL
            )",
        )
        .await?;
        tx.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS content_calendar_event_start_at
                ON content_calendar_event (start_at)",
        )
        .await?;
        tx.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS content_calendar_event_search_data
                ON content_calendar_event USING gin (search_data)",
        )
        .await?;

        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS content_calendar_event_rsvp (
                content_id bigint PRIMARY KEY,
                status smallint NOT NULL,
                event_key_collection smallint NOT NULL,
                event_key_identity character varying NOT NULL,
                event_key_public_key_type smallint NOT NULL,
                event_key_public_key bytea NOT NULL,
                event_key_sequence bigint NOT NULL
            )",
        )
        .await?;
        tx.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS content_calendar_event_rsvp_event_key_idx
                ON content_calendar_event_rsvp (
                    event_key_collection,
                    event_key_identity,
                    event_key_public_key_type,
                    event_key_public_key,
                    event_key_sequence
                )",
        )
        .await?;

        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS content_calendar_event_host (
                content_id bigint NOT NULL,
                identity character varying NOT NULL,
                PRIMARY KEY (content_id, identity)
            )",
        )
        .await?;
        tx.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS content_calendar_event_host_identity
                ON content_calendar_event_host (identity)",
        )
        .await?;

        // Cache of current RSVPs
        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS calendar_event_rsvp (
                event_id bigint PRIMARY KEY,
                identity text NOT NULL,
                on_event bigint NOT NULL,
                status smallint NOT NULL
            )",
        )
        .await?;
        tx.execute_unprepared(
            "CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_rsvp_event_identity_unique
                ON calendar_event_rsvp (on_event, identity)",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP TABLE IF EXISTS calendar_event_rsvp")
            .await?;
        tx.execute_unprepared(
            "DROP TABLE IF EXISTS content_calendar_event_host",
        )
        .await?;
        tx.execute_unprepared(
            "DROP TABLE IF EXISTS content_calendar_event_rsvp",
        )
        .await?;
        tx.execute_unprepared("DROP TABLE IF EXISTS content_calendar_event")
            .await?;

        Ok(())
    }
}
