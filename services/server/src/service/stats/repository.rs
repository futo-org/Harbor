use std::cmp::Reverse;
use std::collections::HashMap;
use std::collections::HashSet;

use ::entity::reaction_summary_model as ReactionSummaryModel;
use ::entity::reaction_tally_model as ReactionTallyModel;
use ::entity::reply_count_model as ReplyCountModel;
use sea_orm::sea_query::{Expr, ExprTrait, JoinType, OnConflict};
use sea_orm::*;

use crate::service::events::TargetEventKey;

pub struct Query;

impl Query {
    /// For each event in `events`, estimate the number of replies it has.
    /// Results are returned as a map from each event's key to its reply count.
    /// Events without any replies may be excluded from the output map.
    pub async fn count_replies(
        db: &DbConn,
        events: Vec<TargetEventKey>,
    ) -> Result<HashMap<TargetEventKey, i64>, DbErr> {
        if events.is_empty() {
            return Ok(HashMap::new());
        }

        let key_cols = [
            ReplyCountModel::Column::EventKeyCollection,
            ReplyCountModel::Column::EventKeyIdentity,
            ReplyCountModel::Column::EventKeyPublicKeyType,
            ReplyCountModel::Column::EventKeyPublicKey,
            ReplyCountModel::Column::EventKeySequence,
        ];

        // Keep only rows for event keys that we care about.
        let filter = Expr::tuple(key_cols.map(Expr::col))
            .in_tuples(event_key_tuples(events));

        // Fetch reply counts maintained by the stats worker.
        let rows = ReplyCountModel::Entity::find()
            .filter(filter)
            .all(db)
            .await?;

        // Store the reply counts as a map for efficient access.
        let map = rows
            .into_iter()
            .map(|row| {
                (
                    TargetEventKey {
                        collection: row.event_key_collection,
                        identity: row.event_key_identity,
                        public_key_type: row.event_key_public_key_type,
                        public_key: row.event_key_public_key,
                        sequence: row.event_key_sequence,
                    },
                    row.reply_count,
                )
            })
            .collect();

        Ok(map)
    }

    /// For each event in `events`, get our estimates for the reaction summary counts.
    /// Results are returned as a map from each event's key to its reaction summary.
    /// Events with no reactions may be excluded from the output map.
    pub async fn summarize_reactions(
        db: &DbConn,
        events: Vec<TargetEventKey>,
    ) -> Result<HashMap<TargetEventKey, ReactionSummary>, DbErr> {
        if events.is_empty() {
            return Ok(HashMap::new());
        }

        // Keep only rows for event keys that we care about.
        let filter = Expr::tuple(SUMMARY_KEY_COLUMNS.map(Expr::col))
            .in_tuples(event_key_tuples(events));

        // Fetch reaction summaries maintained by the stats worker.
        let rows = ReactionSummaryModel::Entity::find()
            .filter(filter)
            .all(db)
            .await?;

        // Store the summaries as a map for efficient access.
        let map = rows
            .into_iter()
            .map(|row| {
                (
                    TargetEventKey {
                        collection: row.event_key_collection,
                        identity: row.event_key_identity,
                        public_key_type: row.event_key_public_key_type,
                        public_key: row.event_key_public_key,
                        sequence: row.event_key_sequence,
                    },
                    ReactionSummary {
                        reaction_count: row.upvote_count + row.downvote_count,
                        upvote_count: row.upvote_count,
                        downvote_count: row.downvote_count,
                    },
                )
            })
            .collect();

        Ok(map)
    }

    /// Get our estimate for the count of each `(emoji, positive)` reaction to
    /// the events specified by `event_keys`.
    /// Up to `limit` rows will be returned for each event key ordered by most
    /// popular to least.
    pub async fn tally_reactions(
        db: &DbConn,
        event_keys: &[TargetEventKey],
        limit: u64,
    ) -> Result<HashMap<TargetEventKey, Vec<ReactionTally>>, DbErr> {
        if event_keys.is_empty() {
            return Ok(HashMap::new());
        }

        // Deduplicate event keys
        let event_keys = event_keys.iter().cloned().collect::<HashSet<_>>();

        // Alias for the event keys to query for
        let keys_table = "keys";

        // Create a filter for event keys
        let key_matches = {
            let tally_key_cols = TALLY_EVENT_KEY_COLUMNS
                .map(|col| Expr::col((ReactionTallyModel::Entity, col)));

            let key_cols =
                ["column1", "column2", "column3", "column4", "column5"]
                    .map(|col| Expr::col((keys_table, col)));

            Expr::tuple(tally_key_cols).eq(Expr::tuple(key_cols))
        };

        // Subquery for finding the reaction tallies for an event key
        let find_tallies_for_key = ReactionTallyModel::Entity::find()
            .filter(ReactionTallyModel::Column::Count.gt(0))
            .filter(key_matches)
            .order_by_desc(ReactionTallyModel::Column::Count)
            .limit(limit)
            .into_query();

        // Outer query to find tallies for all event keys requested.
        // Aliasing the join as the tally table keeps this a query for tally models.
        let mut query = ReactionTallyModel::Entity::find();

        QuerySelect::query(&mut query)
            .from_clear()
            .from_values(event_key_tuples(event_keys), keys_table)
            .join_lateral(
                JoinType::InnerJoin,
                find_tallies_for_key,
                ReactionTallyModel::Entity,
                Condition::all(),
            );

        // Execute the query
        let rows = query.all(db).await?;

        // Gather into a hash map
        let mut output: HashMap<TargetEventKey, Vec<ReactionTally>> =
            HashMap::new();

        for row in rows {
            output
                .entry(TargetEventKey {
                    collection: row.event_key_collection,
                    identity: row.event_key_identity,
                    public_key_type: row.event_key_public_key_type,
                    public_key: row.event_key_public_key,
                    sequence: row.event_key_sequence,
                })
                .or_default()
                .push(ReactionTally {
                    emoji: row.emoji,
                    positive: row.positive,
                    count: row.count,
                });
        }

        // Sort by most popular to least popular
        for tallies in output.values_mut() {
            tallies.sort_unstable_by(|a, b| {
                let left = Reverse((a.count, &a.emoji, a.positive));
                let right = Reverse((b.count, &b.emoji, b.positive));
                left.cmp(&right)
            });
        }

        Ok(output)
    }
}

fn event_key_tuples<T: IntoIterator<Item = TargetEventKey>>(
    event_keys: T,
) -> Vec<EventKeyTuple> {
    event_keys
        .into_iter()
        .map(|k| {
            (
                k.collection,
                k.identity,
                k.public_key_type,
                k.public_key,
                k.sequence,
            )
        })
        .collect()
}

pub struct Mutation;

impl Mutation {
    /// For a new post event, create a row with a reply count of 0.
    pub async fn init_reply_count_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        let result =
            ReplyCountModel::Entity::insert(ReplyCountModel::ActiveModel {
                event_key_collection: Set(key.collection),
                event_key_identity: Set(key.identity),
                event_key_public_key_type: Set(key.public_key_type),
                event_key_public_key: Set(key.public_key),
                event_key_sequence: Set(key.sequence),
                reply_count: Set(0),
            })
            .on_conflict(
                OnConflict::columns([
                    ReplyCountModel::Column::EventKeyCollection,
                    ReplyCountModel::Column::EventKeyIdentity,
                    ReplyCountModel::Column::EventKeyPublicKeyType,
                    ReplyCountModel::Column::EventKeyPublicKey,
                    ReplyCountModel::Column::EventKeySequence,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec(db)
            .await;

        match result {
            Ok(_) => Ok(()),
            Err(DbErr::RecordNotInserted) => Ok(()),
            Err(e) => Err(e),
        }
    }

    /// Increment the reply count for `key` or create a count of 1 if no
    /// counter exists for it.
    pub async fn count_reply_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        // Try inserting a count of 1 if no count is present.
        ReplyCountModel::Entity::insert(ReplyCountModel::ActiveModel {
            event_key_collection: Set(key.collection),
            event_key_identity: Set(key.identity),
            event_key_public_key_type: Set(key.public_key_type),
            event_key_public_key: Set(key.public_key),
            event_key_sequence: Set(key.sequence),
            reply_count: Set(1),
        })
        // Increment the existing count if there is one.
        .on_conflict(
            OnConflict::columns([
                ReplyCountModel::Column::EventKeyCollection,
                ReplyCountModel::Column::EventKeyIdentity,
                ReplyCountModel::Column::EventKeyPublicKeyType,
                ReplyCountModel::Column::EventKeyPublicKey,
                ReplyCountModel::Column::EventKeySequence,
            ])
            .value(
                ReplyCountModel::Column::ReplyCount,
                Expr::col((
                    ReplyCountModel::Entity,
                    ReplyCountModel::Column::ReplyCount,
                ))
                .add(1),
            )
            .to_owned(),
        )
        .exec(db)
        .await?;

        Ok(())
    }

    /// Decrement the reply count for `key`, if it has a recorded reply count > 0.
    pub async fn remove_reply_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        // Only decrement if the reply count is greater than zero.
        let filter = reply_key_condition(key)
            .add(ReplyCountModel::Column::ReplyCount.gt(0));

        ReplyCountModel::Entity::update_many()
            .col_expr(
                ReplyCountModel::Column::ReplyCount,
                Expr::col(ReplyCountModel::Column::ReplyCount).sub(1),
            )
            .filter(filter)
            .exec(db)
            .await?;

        Ok(())
    }

    /// For a new post event, create a reaction summary row with 0 reactions.
    pub async fn init_reaction_summary_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        let result = ReactionSummaryModel::Entity::insert(
            ReactionSummaryModel::ActiveModel {
                event_key_collection: Set(key.collection),
                event_key_identity: Set(key.identity),
                event_key_public_key_type: Set(key.public_key_type),
                event_key_public_key: Set(key.public_key),
                event_key_sequence: Set(key.sequence),
                upvote_count: Set(0),
                downvote_count: Set(0),
            },
        )
        .on_conflict(
            OnConflict::columns(SUMMARY_KEY_COLUMNS)
                .do_nothing()
                .to_owned(),
        )
        .exec(db)
        .await;

        match result {
            Ok(_) => Ok(()),
            Err(DbErr::RecordNotInserted) => Ok(()),
            Err(e) => Err(e),
        }
    }

    /// Increment the upvote or downvote count for the reaction target `key`,
    /// creating a summary row with a count of 1 if none exists yet.
    pub async fn count_reaction_for(
        db: &DbConn,
        key: TargetEventKey,
        positive: bool,
    ) -> Result<(), DbErr> {
        let (upvote, downvote) = if positive { (1, 0) } else { (0, 1) };

        let count_col = if positive {
            ReactionSummaryModel::Column::UpvoteCount
        } else {
            ReactionSummaryModel::Column::DownvoteCount
        };

        // Try inserting a fresh count, incrementing the existing one on conflict.
        ReactionSummaryModel::Entity::insert(
            ReactionSummaryModel::ActiveModel {
                event_key_collection: Set(key.collection),
                event_key_identity: Set(key.identity),
                event_key_public_key_type: Set(key.public_key_type),
                event_key_public_key: Set(key.public_key),
                event_key_sequence: Set(key.sequence),
                upvote_count: Set(upvote),
                downvote_count: Set(downvote),
            },
        )
        .on_conflict(
            OnConflict::columns(SUMMARY_KEY_COLUMNS)
                .value(
                    count_col,
                    Expr::col((ReactionSummaryModel::Entity, count_col)).add(1),
                )
                .to_owned(),
        )
        .exec(db)
        .await?;

        Ok(())
    }

    /// Increment the tally for a specific `(emoji, positive)` reaction to the
    /// target `key`, creating a tally row with a count of 1 if none exists yet.
    pub async fn count_reaction_tally_for(
        db: &DbConn,
        key: TargetEventKey,
        emoji: String,
        positive: bool,
    ) -> Result<(), DbErr> {
        // Try inserting a count of 1, incrementing the existing one on conflict.
        ReactionTallyModel::Entity::insert(ReactionTallyModel::ActiveModel {
            event_key_collection: Set(key.collection),
            event_key_identity: Set(key.identity),
            event_key_public_key_type: Set(key.public_key_type),
            event_key_public_key: Set(key.public_key),
            event_key_sequence: Set(key.sequence),
            emoji: Set(emoji),
            positive: Set(positive),
            count: Set(1),
        })
        .on_conflict(
            OnConflict::columns(TALLY_KEY_COLUMNS)
                .value(
                    ReactionTallyModel::Column::Count,
                    Expr::col((
                        ReactionTallyModel::Entity,
                        ReactionTallyModel::Column::Count,
                    ))
                    .add(1),
                )
                .to_owned(),
        )
        .exec(db)
        .await?;

        Ok(())
    }

    /// Decrement the upvote or downvote count for the reaction target `key`,
    /// only when the relevant count is greater than zero.
    pub async fn remove_reaction_for(
        db: &DbConn,
        key: TargetEventKey,
        positive: bool,
    ) -> Result<(), DbErr> {
        let count_col = if positive {
            ReactionSummaryModel::Column::UpvoteCount
        } else {
            ReactionSummaryModel::Column::DownvoteCount
        };

        // Only decrement if the count is greater than zero.
        let filter = summary_key_condition(key).add(count_col.gt(0));

        ReactionSummaryModel::Entity::update_many()
            .col_expr(count_col, Expr::col(count_col).sub(1))
            .filter(filter)
            .exec(db)
            .await?;

        Ok(())
    }

    /// Decrement the tally for a specific `(emoji, positive)` reaction to the
    /// target `key`, only when that tally is greater than zero.
    pub async fn remove_reaction_tally_for(
        db: &DbConn,
        key: TargetEventKey,
        emoji: String,
        positive: bool,
    ) -> Result<(), DbErr> {
        // Only decrement if the tally is greater than zero.
        let filter = tally_key_condition(key, emoji, positive)
            .add(ReactionTallyModel::Column::Count.gt(0));

        ReactionTallyModel::Entity::update_many()
            .col_expr(
                ReactionTallyModel::Column::Count,
                Expr::col(ReactionTallyModel::Column::Count).sub(1),
            )
            .filter(filter)
            .exec(db)
            .await?;

        Ok(())
    }
}

fn reply_key_condition(key: TargetEventKey) -> Condition {
    Condition::all()
        .add(ReplyCountModel::Column::EventKeyCollection.eq(key.collection))
        .add(ReplyCountModel::Column::EventKeyIdentity.eq(key.identity))
        .add(
            ReplyCountModel::Column::EventKeyPublicKeyType
                .eq(key.public_key_type),
        )
        .add(ReplyCountModel::Column::EventKeyPublicKey.eq(key.public_key))
        .add(ReplyCountModel::Column::EventKeySequence.eq(key.sequence))
}

fn summary_key_condition(key: TargetEventKey) -> Condition {
    Condition::all()
        .add(
            ReactionSummaryModel::Column::EventKeyCollection.eq(key.collection),
        )
        .add(ReactionSummaryModel::Column::EventKeyIdentity.eq(key.identity))
        .add(
            ReactionSummaryModel::Column::EventKeyPublicKeyType
                .eq(key.public_key_type),
        )
        .add(ReactionSummaryModel::Column::EventKeyPublicKey.eq(key.public_key))
        .add(ReactionSummaryModel::Column::EventKeySequence.eq(key.sequence))
}

/// Condition matching all tally rows for the target event `key`.
fn tally_event_key_condition(key: TargetEventKey) -> Condition {
    Condition::all()
        .add(ReactionTallyModel::Column::EventKeyCollection.eq(key.collection))
        .add(ReactionTallyModel::Column::EventKeyIdentity.eq(key.identity))
        .add(
            ReactionTallyModel::Column::EventKeyPublicKeyType
                .eq(key.public_key_type),
        )
        .add(ReactionTallyModel::Column::EventKeyPublicKey.eq(key.public_key))
        .add(ReactionTallyModel::Column::EventKeySequence.eq(key.sequence))
}

fn tally_key_condition(
    key: TargetEventKey,
    emoji: String,
    positive: bool,
) -> Condition {
    tally_event_key_condition(key)
        .add(ReactionTallyModel::Column::Emoji.eq(emoji))
        .add(ReactionTallyModel::Column::Positive.eq(positive))
}

/// The primary key columns of a reaction summary: the target's event key.
const SUMMARY_KEY_COLUMNS: [ReactionSummaryModel::Column; 5] = [
    ReactionSummaryModel::Column::EventKeyCollection,
    ReactionSummaryModel::Column::EventKeyIdentity,
    ReactionSummaryModel::Column::EventKeyPublicKeyType,
    ReactionSummaryModel::Column::EventKeyPublicKey,
    ReactionSummaryModel::Column::EventKeySequence,
];

/// The event key columns of a reaction tally.
const TALLY_EVENT_KEY_COLUMNS: [ReactionTallyModel::Column; 5] = [
    ReactionTallyModel::Column::EventKeyCollection,
    ReactionTallyModel::Column::EventKeyIdentity,
    ReactionTallyModel::Column::EventKeyPublicKeyType,
    ReactionTallyModel::Column::EventKeyPublicKey,
    ReactionTallyModel::Column::EventKeySequence,
];

/// The primary key columns of a reaction tally:
/// the target's event key + `(emoji, positive)`.
const TALLY_KEY_COLUMNS: [ReactionTallyModel::Column; 7] = [
    ReactionTallyModel::Column::EventKeyCollection,
    ReactionTallyModel::Column::EventKeyIdentity,
    ReactionTallyModel::Column::EventKeyPublicKeyType,
    ReactionTallyModel::Column::EventKeyPublicKey,
    ReactionTallyModel::Column::EventKeySequence,
    ReactionTallyModel::Column::Emoji,
    ReactionTallyModel::Column::Positive,
];

/// Tuple representation of an event key for use in DB queries.
type EventKeyTuple = (i16, String, i16, Vec<u8>, i64);

pub struct ReactionSummary {
    pub reaction_count: i64,
    pub upvote_count: i64,
    pub downvote_count: i64,
}

#[derive(FromQueryResult)]
pub struct ReactionTally {
    pub emoji: String,
    pub positive: bool,
    pub count: i64,
}
