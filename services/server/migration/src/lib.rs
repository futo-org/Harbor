pub use sea_orm_migration::prelude::*;

mod m20220101_000001_create_table;
mod m20260430_000002_add_pairing_tables;
mod m20260504_000001_create_push_token_table;
mod m20260514_000001_widen_event_sequence;
mod m20260521_000001_add_event_previous_root;
mod m20260526_000001_add_content_post_quote;
mod m20260526_000002_add_content_repost_table;
mod m20260528_000001_reaction_opinion_to_positive;
mod m20260601_000001_add_content_report_table;
mod m20260601_000001_add_follower_lookup_indexes;
mod m20260604_000001_add_content_label_table;
mod m20260617_000001_add_notification_table;
mod m20260617_000002_drop_push_token_table;
mod m20260618_000001_timestamps_to_timestamptz;
mod m20260625_000001_add_event_key_indices;
mod m20260630_000001_add_verification_tables;
mod m20260707_164130_add_indices_for_sorting;
mod m20260707_191447_add_reply_counts_table;
mod m20260714_000001_add_url_info_cache_table;
mod m20260717_000001_add_url_info_cache_raw_response;
mod m20260720_164457_add_reaction_counters;

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
            Box::new(m20260526_000002_add_content_repost_table::Migration),
            Box::new(m20260528_000001_reaction_opinion_to_positive::Migration),
            Box::new(m20260601_000001_add_content_report_table::Migration),
            Box::new(m20260601_000001_add_follower_lookup_indexes::Migration),
            Box::new(m20260604_000001_add_content_label_table::Migration),
            Box::new(m20260617_000001_add_notification_table::Migration),
            Box::new(m20260617_000002_drop_push_token_table::Migration),
            Box::new(m20260618_000001_timestamps_to_timestamptz::Migration),
            Box::new(m20260625_000001_add_event_key_indices::Migration),
            Box::new(m20260630_000001_add_verification_tables::Migration),
            Box::new(m20260707_164130_add_indices_for_sorting::Migration),
            Box::new(m20260707_191447_add_reply_counts_table::Migration),
            Box::new(m20260714_000001_add_url_info_cache_table::Migration),
            Box::new(
                m20260717_000001_add_url_info_cache_raw_response::Migration,
            ),
            Box::new(m20260720_164457_add_reaction_counters::Migration),
        ]
    }
}
