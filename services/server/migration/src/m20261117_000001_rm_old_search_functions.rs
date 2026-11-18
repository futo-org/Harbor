//! Remove search functions that are no longer used.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "DROP FUNCTION create_tsvector(regconfig, TEXT, \"char\")",
        )
        .await?;

        tx.execute_unprepared("DROP FUNCTION search_query(TEXT)")
            .await?;

        tx.execute_unprepared("DROP AGGREGATE tsvector_agg(tsvector)")
            .await?;

        tx.execute_unprepared("DROP AGGREGATE tsquery_agg(tsquery)")
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(
            "CREATE AGGREGATE tsvector_agg(tsvector) (
                SFUNC = tsvector_concat,
                STYPE = tsvector,
                INITCOND = ''
            )",
        )
        .await?;

        tx.execute_unprepared(
            "CREATE AGGREGATE tsquery_agg(tsquery) (
                SFUNC = tsquery_or,
                STYPE = tsquery,
                INITCOND = ''
            )",
        )
        .await?;

        tx.execute_unprepared("
            CREATE FUNCTION create_tsvector(config regconfig, text text, weight \"char\") RETURNS tsvector
                LANGUAGE sql IMMUTABLE PARALLEL SAFE
                RETURN ((setweight((SELECT tsvector_agg(strip(to_tsvector('simple'::regconfig, data.word))) AS tsvector_agg FROM regexp_split_to_table(COALESCE(create_tsvector.text, ''::text), '[[:space:]]'::text) data(word) WHERE starts_with(data.word, '#'::text)), weight) || setweight(array_to_tsvector(ARRAY(SELECT DISTINCT lower(m.m[1]) AS lower FROM regexp_matches(COALESCE(create_tsvector.text, ''::text), '([0-9a-fA-F]{64})'::text, 'g'::text) m(m))), weight)) || setweight(strip(to_tsvector(config, COALESCE(text, ''::text))), weight))
        ").await?;

        tx.execute_unprepared("
            CREATE FUNCTION search_query(query text) RETURNS tsquery
                LANGUAGE sql IMMUTABLE PARALLEL SAFE
                RETURN ((COALESCE(to_tsquery('english'::regconfig, query), ''::tsquery) || COALESCE(to_tsquery('simple'::regconfig, query), ''::tsquery)) || (SELECT tsquery_agg((data.word)::tsquery) AS tsquery_agg FROM regexp_split_to_table(COALESCE(search_query.query, ''::text), '[[:space:]]'::text) data(word) WHERE (\"left\"(data.word, '-2'::integer) ~ '^([a-fA-F0-9])*$'::text)))
        ").await?;

        Ok(())
    }
}
