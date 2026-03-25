use log;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use std::time::Duration;

pub async fn build_db_client() -> Result<DatabaseConnection, sea_orm::DbErr> {
    let mut opt =
        ConnectOptions::new("protocol://username:password@host/database");
    opt.max_connections(100)
        .min_connections(5)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(8))
        .max_lifetime(Duration::from_secs(8))
        .sqlx_logging(false)
        .sqlx_logging_level(log::LevelFilter::Info)
        .set_schema_search_path("my_schema");

    let db = Database::connect(opt).await?;
    Ok(db)
}
