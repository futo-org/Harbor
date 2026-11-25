//! Store the timezone, labels and location url of calendar events

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "ALTER TABLE content_calendar_event
                ADD COLUMN IF NOT EXISTS location_url text,
                ADD COLUMN IF NOT EXISTS timezone text,
                ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}'",
        )
        .await?;

        // Rebuild the search vector from one vector per column
        tx.execute_unprepared(
            "ALTER TABLE content_calendar_event
                DROP COLUMN IF EXISTS search_data",
        )
        .await?;
        tx.execute_unprepared(
            "ALTER TABLE content_calendar_event
                ADD COLUMN search_data tsvector GENERATED ALWAYS AS (
                    create_tsvector(title)
                    || create_tsvector(description)
                    || create_tsvector(location_name)
                    || create_tsvector(location_address)
                ) STORED NOT NULL",
        )
        .await?;
        tx.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS content_calendar_event_search_data
                ON content_calendar_event USING gin (search_data)",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "ALTER TABLE content_calendar_event
                DROP COLUMN IF EXISTS location_url,
                DROP COLUMN IF EXISTS timezone,
                DROP COLUMN IF EXISTS labels",
        )
        .await?;

        Ok(())
    }
}
