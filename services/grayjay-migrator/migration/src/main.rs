use sea_orm::{ConnectionTrait, Database};
use sea_orm_migration::prelude::*;

#[tokio::main]
async fn main() {
    let schema = std::env::var("HARBOR_GRAYJAY_MIGRATOR_DATABASE_SCHEMA")
        .unwrap_or_else(|_| "grayjay_migrator".to_string());

    if let Ok(db_url) = std::env::var("HARBOR_DATABASE_URL") {
        // Needed by SeaORM's CLI.
        unsafe { std::env::set_var("DATABASE_URL", db_url) };
    }

    cli::run_cli_with_connection(grayjay_migrator_migration::Migrator, move |mut options| {
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
