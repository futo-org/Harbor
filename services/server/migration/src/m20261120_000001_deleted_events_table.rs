use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        // NOTE: since this table is only filled by moving (deleting) rows from
        // the event table we don't add any unique constraints that we have on
        // the event table, they should already checked, so no point in slowing
        // this table down.
        tx.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS deleted_event (
                id bigint PRIMARY KEY,
                collection smallint NOT NULL,
                identity character varying NOT NULL,
                public_key_type smallint NOT NULL,
                public_key bytea NOT NULL,
                sequence bigint NOT NULL,
                content_digest_type integer,
                content_digest_bytes bytea,
                signature bytea NOT NULL,
                previous_signature bytea NOT NULL,
                previous_root bytea NOT NULL,
                event_bytes bytea NOT NULL,
                created_at timestamp with time zone NOT NULL,
                synced_at timestamp with time zone NOT NULL,
                application_id integer,
                content_type smallint
            )",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("DROP TABLE IF EXISTS deleted_event")
            .await?;

        Ok(())
    }
}
