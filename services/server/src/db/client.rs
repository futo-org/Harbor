use log;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use std::time::Duration;

pub async fn build_db_client() -> Result<DatabaseConnection, sea_orm::DbErr> {
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgres://postgres:testing@localhost:5432".to_string()
    });
    let mut opt = ConnectOptions::new(with_utc_timezone(&database_url));
    opt.max_connections(100)
        .min_connections(5)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(8))
        .max_lifetime(Duration::from_secs(8))
        .sqlx_logging(false)
        .sqlx_logging_level(log::LevelFilter::Info)
        .set_schema_search_path("public");

    let db = Database::connect(opt).await?;
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
