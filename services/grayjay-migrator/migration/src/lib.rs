pub use sea_orm_migration::prelude::*;

mod m20260901_000001_create_migrated_identity_table;
mod m20260901_000002_create_migrated_event_table;
mod m20260901_000003_add_moderation_to_migrated_event;
mod m20260901_000004_add_content_digest_to_migrated_event;
mod m20260901_000005_create_tool_tables;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260901_000001_create_migrated_identity_table::Migration),
            Box::new(m20260901_000002_create_migrated_event_table::Migration),
            Box::new(m20260901_000003_add_moderation_to_migrated_event::Migration),
            Box::new(m20260901_000004_add_content_digest_to_migrated_event::Migration),
            Box::new(m20260901_000005_create_tool_tables::Migration),
        ]
    }
}
