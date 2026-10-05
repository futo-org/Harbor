use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "CREATE AGGREGATE tsquery_agg (tsquery) (
                SFUNC = pg_catalog.tsquery_or,
                STYPE = pg_catalog.tsquery,
                INITCOND = '' -- Return an empty query instead of NULL.
            )",
        )
        .await?;

        tx.execute_unprepared(
            "CREATE OR REPLACE FUNCTION search_query(query TEXT) RETURNS tsquery
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
            RETURN (
              COALESCE(to_tsquery('english', search_query.query), ''::tsquery)
              -- In case of partial searches we want to fallback to using the simple dictionary.
              || COALESCE(to_tsquery('simple', search_query.query), ''::tsquery)
              -- Explicitly search for any identities, work around for #1658.
              || (
                SELECT tsquery_agg(word::tsquery)
                FROM regexp_split_to_table(COALESCE(search_query.query, ''), '[[:space:]]') as data(word)
                WHERE left(word, -2) ~ '^([a-fA-F0-9]{2})*$' -- Valid hexidecimal.
              )
            )"
        ).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "CREATE OR REPLACE FUNCTION search_query(query TEXT) RETURNS tsquery
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
            RETURN (
              COALESCE(to_tsquery('english', search_query.query), to_tsquery('simple', ''))
              -- In case of partial searches we want to fallback to using the simple dictionary.
              || COALESCE(to_tsquery('simple', search_query.query), to_tsquery('simple', ''))
            )"
        ).await?;

        tx.execute_unprepared("DROP AGGREGATE IF EXISTS tsquery_agg (tsquery)")
            .await?;

        Ok(())
    }
}
