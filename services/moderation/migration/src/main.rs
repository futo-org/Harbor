use sea_orm::{ConnectionTrait, Database};
use sea_orm_migration::prelude::*;

#[tokio::main]
async fn main() {
    let schema = std::env::var("POLYCENTRIC_MODERATION_DATABASE_SCHEMA")
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
