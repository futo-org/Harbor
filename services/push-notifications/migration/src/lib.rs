pub use sea_orm_migration::prelude::*;

mod m20260504_000001_create_push_token_table;
mod m20260616_000001_add_updated_at_to_push_token;
mod m20260618_000001_push_token_timestamptz;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260504_000001_create_push_token_table::Migration),
            Box::new(m20260616_000001_add_updated_at_to_push_token::Migration),
            Box::new(m20260618_000001_push_token_timestamptz::Migration),
        ]
    }
}
