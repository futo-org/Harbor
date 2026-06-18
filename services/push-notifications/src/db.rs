use push_notifications_migration::{Migrator, MigratorTrait};
use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr};

/// Connect to Postgres with the notifications schema as the search path,
/// creating the schema if it does not yet exist. This service owns the
/// `push_token` table that lives in that schema.
pub async fn connect() -> Result<DatabaseConnection, DbErr> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:testing@localhost:5432".to_string());
    let schema = std::env::var("POLYCENTRIC_NOTIFICATIONS_DATABASE_SCHEMA")
        .unwrap_or_else(|_| "notifications".to_string());

    let mut opt = ConnectOptions::new(database_url);
    opt.set_schema_search_path(&schema);
    let connection = Database::connect(opt).await?;

    connection
        .execute_unprepared(&format!("CREATE SCHEMA IF NOT EXISTS \"{schema}\""))
        .await?;

    Ok(connection)
}

pub async fn run_migrations(connection: &DatabaseConnection) -> Result<(), DbErr> {
    Migrator::up(connection, None).await?;
    Ok(())
}
