use sea_orm::{ConnectionTrait, Database};
use sea_orm_migration::prelude::*;
use std::env;

#[tokio::main]
async fn main() {
    // The cli loads the .env file for us, but requires the DATABASE_URL env
    // var, whic we don't set. To work around this load the .env file ourselves
    // and then copy HARBOR_DATABASE_URL to DATABASE_URL so the migrator is
    // happy.
    common_dotenv::load(".env");
    common_dotenv::load("../.env"); // So it can be run in the migration directory.
    if let Err(_) = env::var("DATABASE_URL")
        && let Ok(db_url) = env::var("HARBOR_DATABASE_URL")
    {
        unsafe { env::set_var("DATABASE_URL", db_url) }
    }

    let schema = std::env::var("HARBOR_MODERATION_DATABASE_SCHEMA")
        .unwrap_or_else(|_| "moderation".to_string());

    cli::run_cli_with_connection(moderation_migration::Migrator, move |mut options| {
        let schema = schema.clone();
        async move {
            options.set_schema_search_path(schema.clone());
            let db = Database::connect(options).await?;
            db.execute_unprepared(&format!("CREATE SCHEMA IF NOT EXISTS \"{schema}\""))
                .await?;
            Ok(db)
        }
    })
    .await;
}
