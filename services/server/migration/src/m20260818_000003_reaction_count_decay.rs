use sea_orm::{DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const GRAVITY_TABLE_NAME: &str = "gravity";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        // The main function.
        let create_function = Statement::from_string(
            DatabaseBackend::Postgres,
            "CREATE OR REPLACE FUNCTION reaction_count_decay(count BIGINT, created_at TIMESTAMPTZ, gravity NUMERIC) RETURNS NUMERIC
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
            RETURN (
              count::NUMERIC / power(
                -- The number of seconds since submission.
                (EXTRACT(epoch FROM (CURRENT_TIMESTAMP - created_at))::NUMERIC
                  / 3600::NUMERIC) -- Turned into number of hours.
                  + 2::NUMERIC,
                gravity
              )
            )::NUMERIC(20, 11);"
        );
        tx.execute_raw(create_function).await.unwrap();

        let comment = Statement::from_string(
            DatabaseBackend::Postgres,
            "COMMENT ON FUNCTION reaction_count_decay(BIGINT, TIMESTAMPTZ, NUMERIC) IS 'Algorithm = `P / ((T+2) ^ G)`, where P is the positive reaction count, T is the number of hours since submitted and G the gravity constant. NOTE: the precision is limited to 11 digits after the decimal, this is required to avoid precision errors.';",
        );
        tx.execute_raw(comment).await.unwrap();

        //  Create a table that holds a single value, the "dynamic gravity".
        let mut create_table = TableCreateStatement::new();
        create_table.table(GRAVITY_TABLE_NAME).col({
            let mut def = ColumnDef::new("value");
            def.decimal_len(20, 11).not_null();
            def
        });
        tx.execute(&create_table).await?;

        let comment = Statement::from_string(
            DatabaseBackend::Postgres,
            format!(
                "COMMENT ON TABLE {GRAVITY_TABLE_NAME} IS 'Table to hold the dynamic gravity value.';"
            ),
        );
        tx.execute_raw(comment).await.unwrap();

        // Add the require one value.
        let default_value = Statement::from_string(
            DatabaseBackend::Postgres,
            format!("INSERT INTO {GRAVITY_TABLE_NAME} VALUES (1.8);"),
        );
        tx.execute_raw(default_value).await.unwrap();

        let default_value = Statement::from_string(
            DatabaseBackend::Postgres,
            format!(
                "CREATE UNIQUE INDEX one_gravity_value ON {GRAVITY_TABLE_NAME} ( ( true ) );"
            ),
        );
        tx.execute_raw(default_value).await.unwrap();

        // A version that uses the dynamic gravity value.
        let create_function = Statement::from_string(
            DatabaseBackend::Postgres,
            "CREATE OR REPLACE FUNCTION reaction_count_decay(count BIGINT, created_at TIMESTAMPTZ) RETURNS NUMERIC
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
            RETURN reaction_count_decay(count, created_at, (SELECT value FROM gravity));"
        );

        tx.execute_raw(create_function).await.unwrap();

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();

        let to_drop = [
            "FUNCTION reaction_count_decay(BIGINT, TIMESTAMPTZ)",
            "FUNCTION reaction_count_decay(BIGINT, TIMESTAMPTZ, NUMERIC)",
            &format!("TABLE {GRAVITY_TABLE_NAME}"),
        ];

        for to_drop in to_drop {
            let stmt = Statement::from_string(
                DatabaseBackend::Postgres,
                format!("DROP {to_drop};"),
            );
            tx.execute_raw(stmt).await.unwrap();
        }

        Ok(())
    }
}
