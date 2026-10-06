use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
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
                        FROM string_to_table(COALESCE(text, ''), ' ') as data(word)
                        WHERE starts_with(word, '#')
                    ), weight
                ) ||
                setweight(strip(to_tsvector(config, COALESCE(text, ''))), weight)
            )
        ").await?;

        Ok(())
    }
}
