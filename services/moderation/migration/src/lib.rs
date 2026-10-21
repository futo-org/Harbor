pub use sea_orm_migration::prelude::*;

mod m20220101_000001_create_table;
mod m20260604_000001_create_created_tables;
mod m20260618_000001_timestamps_to_timestamptz;
mod m20260806_000001_create_moderator_table;
mod m20261020_000001_drop_moderator_table;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20220101_000001_create_table::Migration),
            Box::new(m20260604_000001_create_created_tables::Migration),
            Box::new(m20260618_000001_timestamps_to_timestamptz::Migration),
            Box::new(m20260806_000001_create_moderator_table::Migration),
            Box::new(m20261020_000001_drop_moderator_table::Migration),
        ]
    }
}
