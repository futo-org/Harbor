use push_notifications_migration::{Migrator, MigratorTrait};
use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr};

/// Connect to Postgres with the notifications schema as the search path,
/// creating the schema if it does not yet exist. This service owns the
/// `push_token` table that lives in that schema.
pub async fn connect() -> Result<DatabaseConnection, DbErr> {
    let config = crate::config::get();
    let schema = &config.database_schema;

    let mut opt = ConnectOptions::new(with_utc_timezone(&config.database_url));
    opt.set_schema_search_path(schema);
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
