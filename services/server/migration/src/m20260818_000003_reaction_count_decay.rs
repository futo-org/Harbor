use sea_orm::{DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        let create_function = Statement::from_string(
            DatabaseBackend::Postgres,
            "CREATE OR REPLACE FUNCTION reaction_count_decay(count BIGINT, created_at TIMESTAMPTZ) RETURNS NUMERIC
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
            RETURN (
              count::NUMERIC / power(
                -- The number of seconds since submission.
                (EXTRACT(epoch FROM (CURRENT_TIMESTAMP - created_at))::NUMERIC
                  / 3600::NUMERIC) -- Turned into number of hours.
                  + 2::NUMERIC,
                1.8::NUMERIC -- Gravity.
              )
            )::NUMERIC(20, 11);"
        );

        conn.execute_raw(create_function).await.unwrap();

        let comment = Statement::from_string(
            DatabaseBackend::Postgres,
            "COMMENT ON FUNCTION reaction_count_decay IS 'Algorithm = `P / ((T+2) ^ G)`, where P is the positive reaction count, T is the number of hours since submitted and G the gravity constant. NOTE: the precision is limited to 11 digits after the decimal, this is required to avoid precision errors.';",
        );
        conn.execute_raw(comment).await.unwrap();

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let stmt = Statement::from_string(
            DatabaseBackend::Postgres,
            "DROP FUNCTION reaction_count_decay(BIGINT, TIMESTAMPTZ);",
        );
        conn.execute_raw(stmt).await.unwrap();
        Ok(())
    }
}
