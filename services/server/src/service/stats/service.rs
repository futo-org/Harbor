use std::collections::HashMap;

use polycentric_common::models::protos_v2::{
    EventMetadata, ReactionTally as ProtoReactionTally,
};
use sea_orm::{ConnectionTrait, DbErr};

use crate::data::EventId;
use crate::service::stats::repository::{
    InteractionTally, Query, ReactionTally,
};

#[derive(Default)]
pub struct EventStats {
    interactions: HashMap<EventId, InteractionTally>,
    reaction_tallies: HashMap<EventId, Vec<ReactionTally>>,
}

/// Gather reply counts, reaction summaries, and emoji tallies for events.
pub async fn gather_stats_for<C: ConnectionTrait>(
    db: &C,
    event_ids: impl ExactSizeIterator<Item = EventId> + Clone,
) -> Result<EventStats, DbErr> {
    let interactions = Query::interactions(db, event_ids.clone()).await?;
    let reaction_tallies = Query::tally_reactions(db, event_ids).await?;
    Ok(EventStats {
        interactions,
        reaction_tallies,
    })
}

/// Populate `meta` with values from `stats`.
pub fn include_stats(
    meta: &mut Option<EventMetadata>,
    event_id: EventId,
    stats: &EventStats,
) {
    if let Some(interactions) = stats.interactions.get(&event_id) {
        let InteractionTally {
            reaction_positive,
            reaction_negative,
            replies,
            reposts,
            quotes,
        } = interactions;

        meta.get_or_insert_default().reply_count =
            Some(truncate_count(*replies));
        meta.get_or_insert_default().reaction_count =
            Some(truncate_count(*reaction_positive + *reaction_negative));
        meta.get_or_insert_default().upvote_count =
            Some(truncate_count(*reaction_positive));
        meta.get_or_insert_default().downvote_count =
            Some(truncate_count(*reaction_negative));
        meta.get_or_insert_default().repost_count =
            Some(truncate_count(*reposts));
        meta.get_or_insert_default().quote_count =
            Some(truncate_count(*quotes));
    }

    if let Some(tallies) = stats.reaction_tallies.get(&event_id) {
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

/// Truncate a stat count to the `i32` max.
/// Assumes counts are non-negative.
fn truncate_count(count: i64) -> i32 {
    i32::try_from(count).unwrap_or(i32::MAX)
}
