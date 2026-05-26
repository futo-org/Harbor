pub use sea_orm_migration::prelude::*;

mod m20220101_000001_create_table;
mod m20260430_000002_add_pairing_tables;
mod m20260504_000001_create_push_token_table;
mod m20260514_000001_widen_event_sequence;
mod m20260521_000001_add_event_previous_root;
mod m20260526_000001_add_content_post_quote;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20220101_000001_create_table::Migration),
            Box::new(m20260430_000002_add_pairing_tables::Migration),
            Box::new(m20260504_000001_create_push_token_table::Migration),
            Box::new(m20260514_000001_widen_event_sequence::Migration),
            Box::new(m20260521_000001_add_event_previous_root::Migration),
            Box::new(m20260526_000001_add_content_post_quote::Migration),
        ]
    }
}
