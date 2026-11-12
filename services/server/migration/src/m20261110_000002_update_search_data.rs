//! Update the search data using the newly added parses (see
//! `m20261110_000001_customer_tsvector_parser`).

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        // Drop index to speedup updating of search data.
        tx.execute_unprepared("DROP INDEX IF EXISTS content_post_search_data")
            .await?;
        tx.execute_unprepared("ALTER TABLE content_post ALTER COLUMN search_data SET EXPRESSION AS (create_tsvector(text))").await?;
        // Recreate the index.
        tx.execute_unprepared("CREATE INDEX content_post_search_data ON content_post USING gin (search_data)").await?;

        // Same as above, but for the profile table.
        tx.execute_unprepared("DROP INDEX IF EXISTS profile_search_data")
            .await?;
        tx.execute_unprepared("
            UPDATE profile SET
              search_data = COALESCE(create_tsvector(content_profile_update.alias), ''::TSVECTOR)
                || COALESCE(create_tsvector(profile.identity), ''::TSVECTOR)
                || COALESCE(create_tsvector(profile.name), ''::TSVECTOR)
            FROM events
            LEFT JOIN content ON events.content_digest_type = content.digest_type
              AND events.content_digest_bytes = content.digest_bytes
            LEFT JOIN content_profile_update ON content.id = content_profile_update.content_id
            WHERE events.id = profile.event_id
        ").await?;

        tx.execute_unprepared("CREATE INDEX profile_search_data ON profile USING gin (search_data)").await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP INDEX IF EXISTS content_post_search_data")
            .await?;
        tx.execute_unprepared("ALTER TABLE content_post ALTER COLUMN search_data SET EXPRESSION AS (create_tsvector('english', text, 'A'))").await?;
        tx.execute_unprepared("CREATE INDEX content_post_search_data ON content_post USING gin (search_data)").await?;

        tx.execute_unprepared("DROP INDEX IF EXISTS profile_search_data")
            .await?;
        tx.execute_unprepared("
            UPDATE profile SET
              search_data = create_tsvector('simple', COALESCE(content_profile_update.alias, ''), 'A')
                || setweight(array_to_tsvector(ARRAY[profile.identity]), 'A')
                || create_tsvector('simple', COALESCE(profile.name, ''), 'B')
            FROM events
            INNER JOIN content ON events.content_digest_type = content.digest_type
              AND events.content_digest_bytes = content.digest_bytes
            INNER JOIN content_profile_update ON content.id = content_profile_update.content_id
            WHERE events.id = profile.event_id
        ").await?;
        tx.execute_unprepared("CREATE INDEX profile_search_data ON profile USING gin (search_data)").await?;

        Ok(())
    }
}
