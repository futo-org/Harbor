use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use std::time::Duration;

pub async fn build_db_client() -> Result<DatabaseConnection, sea_orm::DbErr> {
    let config = crate::config::get();
    let mut opt = ConnectOptions::new(with_utc_timezone(&config.database_url));
    opt.max_connections(config.database_max_connections)
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
