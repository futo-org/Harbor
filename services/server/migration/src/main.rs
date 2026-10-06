use std::env;

use sea_orm_migration::prelude::*;

#[tokio::main]
async fn main() {
    if let Ok(db_url) = env::var("HARBOR_DATABASE_URL") {
        // Needed by SeaORM's CLI.
        unsafe { env::set_var("DATABASE_URL", db_url) };
    }

    cli::run_cli(migration::Migrator).await;
}
