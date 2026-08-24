use std::collections::HashMap;

use polycentric_common::models::protos_v2::{
    EventBundle, EventMetadata, ReactionTally as ProtoReactionTally,
};
use sea_orm::{DbConn, DbErr};

use crate::data::EventWithContentRow;
use crate::service::{
    events::TargetEventKey,
    identity::service::row_to_bundle,
    stats::repository::{Query, ReactionSummary, ReactionTally},
};

/// Max number of emoji tallies to return per event.
const EMOJI_TALLY_LIMIT: u64 = 50;

#[derive(Default)]
pub struct EventStats {
    pub reply_counts: HashMap<TargetEventKey, i64>,
    pub reaction_summaries: HashMap<TargetEventKey, ReactionSummary>,
    pub reaction_tallies: HashMap<TargetEventKey, Vec<ReactionTally>>,
}

/// Gather reply counts, reaction summaries, and emoji tallies for `display_keys`.
pub async fn gather_stats_for(
    db: &DbConn,
    display_keys: &[TargetEventKey],
) -> Result<EventStats, DbErr> {
    let (reply_counts, reaction_summaries, reaction_tallies) = tokio::try_join!(
        Query::count_replies(db, display_keys.to_owned()),
        Query::summarize_reactions(db, display_keys.to_owned()),
        Query::tally_reactions(db, display_keys, EMOJI_TALLY_LIMIT),
    )?;

    Ok(EventStats {
        reply_counts,
        reaction_summaries,
        reaction_tallies,
    })
}

/// Truncate a stat count to the `i32` max.
/// Assumes counts are non-negative.
fn truncate_count(count: i64) -> i32 {
    i32::try_from(count).unwrap_or(i32::MAX)
}

/// Populate `meta` with values from `stats`.
pub fn include_stats(
    meta: &mut Option<EventMetadata>,
    event_key: &TargetEventKey,
    stats: &EventStats,
) {
    if let Some(reply_count) = stats.reply_counts.get(event_key) {
        meta.get_or_insert_default().reply_count =
            Some(truncate_count(*reply_count));
    }

    if let Some(summary) = stats.reaction_summaries.get(event_key) {
        let meta = meta.get_or_insert_default();
        meta.reaction_count = Some(truncate_count(summary.reaction_count));
        meta.upvote_count = Some(truncate_count(summary.upvote_count));
        meta.downvote_count = Some(truncate_count(summary.downvote_count));
    }

    if let Some(tallies) = stats.reaction_tallies.get(event_key) {
        meta.get_or_insert_default().emoji_reactions = tallies
            .iter()
            .map(|tally| ProtoReactionTally {
                emoji: tally.emoji.clone(),
                positive: tally.positive,
                count: truncate_count(tally.count),
            })
            .collect();
    }
}

/// Create event bundles with metadata.
pub fn assemble_bundles(
    rows: Vec<EventWithContentRow>,
    stats: &EventStats,
) -> Vec<EventBundle> {
    rows.into_iter()
        .map(|row| {
            let (event, _) = &row;
            let key = TargetEventKey::of(event);

            let mut bundle = row_to_bundle(row);
            include_stats(&mut bundle.meta, &key, stats);
            bundle
        })
        .collect::<Vec<_>>()
}
