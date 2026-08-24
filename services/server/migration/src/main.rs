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

    cli::run_cli(migration::Migrator).await;
}
