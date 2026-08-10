use sea_orm::{DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        let stmt = Statement::from_string(DatabaseBackend::Postgres, "
            CREATE FUNCTION search_query(query TEXT) RETURNS tsquery
              LANGUAGE sql IMMUTABLE PARALLEL SAFE
            RETURN (
              COALESCE(to_tsquery('english', search_query.query), to_tsquery('simple', ''))
              -- In case of partial searches we want to fallback to using the simple dictionary.
              || COALESCE(to_tsquery('simple', search_query.query), to_tsquery('simple', ''))
            );");

        conn.execute_raw(stmt).await.unwrap();
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let stmt = Statement::from_string(
            DatabaseBackend::Postgres,
            "DROP FUNCTION search_query(TEXT);",
        );
        conn.execute_raw(stmt).await.unwrap();
        Ok(())
    }
}
