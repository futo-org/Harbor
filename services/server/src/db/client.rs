use std::time::Duration;

use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use crate::config;

/// Returns read-write and read-only database connection pools.
pub async fn build_db_clients()
-> Result<(DatabaseConnection, DatabaseConnection), sea_orm::DbErr> {
    let config = config::get();

    let db = create_pool(&config.database_url, config.database_max_connections)
        .await?;

    let ro_db = if let Some(url) = config.ro_database_url.as_deref() {
        create_pool(url, config.database_max_connections).await?
    } else {
        // If no read-only instance is available reuse the read-write pool.
        db.clone()
    };

    Ok((db, ro_db))
}

async fn create_pool(
    url: &str,
    max: u32,
) -> Result<DatabaseConnection, sea_orm::DbErr> {
    let mut opt = ConnectOptions::new(with_utc_timezone(url));
    opt.max_connections(max)
        .min_connections(5)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .sqlx_logging(false)
        .set_schema_search_path("public");

    let db = Database::connect(opt).await?;

    common_telemetry::observe_db_pool(
        "server",
        db.get_postgres_connection_pool().clone(),
    );

    Ok(db)
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
