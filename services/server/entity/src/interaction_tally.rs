//! Model for the `interaction_tally` table.

use sea_orm::entity::prelude::*;

/// Cache for interaction counters.
///
/// This table contains the positive and negative sum of each *not-deleted*
/// reaction, based on the (valid) reaction and deletion events in `events`
/// table, per *not-deleted* post.
///
/// This table purely serves as a cache. The source of truth is always the
/// `events` table and this table can be fully recreated based on it.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "interaction_tally")]
pub struct Model {
    /// Id of the event that contains the post.
    ///
    /// Also a foreign key to the event (`events` table).
    #[sea_orm(primary_key, auto_increment = false)]
    pub event_id: i64,
    /// Total amount of positive reactions (as determined by
    /// `reaction.positive`).
    pub reaction_positive_count: i64,
    /// Total amount of positive reactions (as determined by
    /// `NOT reaction.positive`).
    pub reaction_negative_count: i64,
    /// Total amount of replies.
    pub reply_count: i64,
    /// Total amount of reposts.
    pub repost_count: i64,
    /// Total amount of quotes.
    pub quote_count: i64,
    /// Decayed count calculated by `reaction_count_decay`.
    ///
    /// NOTE: actual type `NUMERIC(20, 11)`.
    pub decayed_count: String,

    #[sea_orm(belongs_to, from = "event_id", to = "id")]
    pub parent: HasOne<super::event::Entity>,
}

impl ActiveModelBehavior for ActiveModel {}
