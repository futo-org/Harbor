use moderation_migration::{Migrator, MigratorTrait};
use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr};

/// Connect to Postgres with the moderation schema as the search path,
/// creating the schema if it does not yet exist.
pub async fn connect() -> Result<DatabaseConnection, DbErr> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:testing@localhost:5432".to_string());
    let schema = std::env::var("POLYCENTRIC_MODERATION_DATABASE_SCHEMA")
        .unwrap_or_else(|_| "moderation".to_string());

    let mut opt = ConnectOptions::new(with_utc_timezone(&database_url));
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

/// Strictly enforce a UTC timezone connection by appending the
/// `options=-c timezone=UTC` parameter.
fn with_utc_timezone(url: &str) -> String {
    if url.contains("timezone") {
        return url.to_string();
    }
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{url}{sep}options=-c%20timezone%3DUTC")
}
