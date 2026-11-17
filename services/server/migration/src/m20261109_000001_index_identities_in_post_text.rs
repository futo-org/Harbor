//! Index identity hex strings in post text as whole lexemes.
//!
//! Postgres' default text search parser reads an identity like `1e45d9...`,
//! parses the leading scientific notation number, and separates it into a float
//! component followed by the rest of the string. This migration follows the
//! changes to `search_query` (#1658), splitting out all identity-shaped strings
//! into lexemes early to avoid them getting parsed in this way.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const IDENTITY_PATTERN: &str = "[0-9a-fA-F]{64}";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared(&format!("
            CREATE OR REPLACE FUNCTION create_tsvector(config regconfig, text TEXT, weight \"char\") RETURNS tsvector
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
              CALLED ON NULL INPUT
            RETURN (
                setweight(
                    (
                        SELECT tsvector_agg(strip(to_tsvector('simple', word)))
                        FROM regexp_split_to_table(COALESCE(text, ''), '[[:space:]]') as data(word)
                        WHERE starts_with(word, '#')
                    ), weight
                ) ||
                setweight(
                    array_to_tsvector(ARRAY(
                        SELECT DISTINCT lower(m[1])
                        FROM regexp_matches(COALESCE(text, ''), '({IDENTITY_PATTERN})', 'g') AS m
                    )), weight
                ) ||
                setweight(strip(to_tsvector(config, COALESCE(text, ''))), weight)
            )
        ")).await?;

        // Update the stored generated columns for all rows affected
        tx.execute_unprepared(&format!(
            "UPDATE content_post SET text = text WHERE text ~ '{IDENTITY_PATTERN}'"
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        tx.execute_unprepared("
            CREATE OR REPLACE FUNCTION create_tsvector(config regconfig, text TEXT, weight \"char\") RETURNS tsvector
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
              CALLED ON NULL INPUT
            RETURN (
                setweight(
                    (
                        SELECT tsvector_agg(strip(to_tsvector('simple', word)))
                        FROM regexp_split_to_table(COALESCE(text, ''), '[[:space:]]') as data(word)
                        WHERE starts_with(word, '#')
                    ), weight
                ) ||
                setweight(strip(to_tsvector(config, COALESCE(text, ''))), weight)
            )
        ").await?;

        tx.execute_unprepared(&format!(
            "UPDATE content_post SET text = text WHERE text ~ '{IDENTITY_PATTERN}'"
        ))
        .await?;

        Ok(())
    }
}
