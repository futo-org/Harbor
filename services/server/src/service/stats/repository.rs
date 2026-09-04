use std::collections::HashMap;

use entity::{
    attributed_to_reaction_summary_model as AttributedSummaryModel,
    reaction_model, reaction_summary_model as ReactionSummaryModel,
    reaction_tally_model as ReactionTallyModel, reaction_tally_model2,
    reply_count_model as ReplyCountModel, reply_model,
};
use sea_orm::ActiveValue::Set;
use sea_orm::sea_query::{
    Asterisk, ColumnRef, Expr, ExprTrait, Func, OnConflict, Order,
    SelectStatement,
};
use sea_orm::{
    ColumnTrait, Condition, ConnectionTrait, DbConn, DbErr, EntityTrait,
    QueryFilter,
};

use crate::data::EventId;
use crate::service::events::TargetEventKey;

pub struct Query;

impl Query {
    /// For each event in `events`, estimate the number of replies it has.
    /// Results are returned as a map from each event's key to its reply count.
    /// Events without any replies may be excluded from the output map.
    pub async fn count_replies(
        db: &DbConn,
        event_ids: impl ExactSizeIterator<Item = EventId>,
    ) -> Result<HashMap<EventId, i64>, DbErr> {
        if event_ids.len() == 0 {
            return Ok(HashMap::new());
        }

        let mut query = SelectStatement::new();
        query
            .from(reply_model::Entity)
            .expr_as(
                Expr::col(reply_model::Column::EventId.as_column_ref()),
                "event_id",
            )
            .expr_as(Expr::from(Func::count(Expr::col(Asterisk))), "count")
            .cond_where(
                Expr::col(reply_model::Column::EventId.as_column_ref())
                    .is_in(event_ids),
            )
            .group_by_col(reply_model::Column::EventId.as_column_ref());

        let rows = db.query_all(&query).await?;
        let map = rows
            .into_iter()
            .map(|row| -> Result<(EventId, i64), DbErr> {
                Ok((row.try_get_by(0)?, row.try_get_by(1)?))
            })
            .collect::<Result<HashMap<_, _>, _>>()?;
        Ok(map)
    }

    /// For each event in `events`, get our estimates for the reaction summary counts.
    /// Results are returned as a map from each event's key to its reaction summary.
    /// Events with no reactions may be excluded from the output map.
    pub async fn summarize_reactions(
        db: &DbConn,
        event_ids: impl ExactSizeIterator<Item = EventId>,
    ) -> Result<HashMap<EventId, ReactionSummary>, DbErr> {
        if event_ids.len() == 0 {
            return Ok(HashMap::new());
        }

        let mut query = SelectStatement::new();
        query
            .from(reaction_tally_model2::Entity)
            .expr_as(
                Expr::col(
                    reaction_tally_model2::Column::EventId.as_column_ref(),
                ),
                "event_id",
            )
            .expr_as(
                Expr::col(
                    reaction_tally_model2::Column::PositiveCount
                        .as_column_ref(),
                ),
                "positive_count",
            )
            .expr_as(
                Expr::col(
                    reaction_tally_model2::Column::NegativeCount
                        .as_column_ref(),
                ),
                "negative_count",
            )
            .cond_where(
                Expr::col(
                    reaction_tally_model2::Column::EventId.as_column_ref(),
                )
                .is_in(event_ids),
            );

        let rows = db.query_all(&query).await?;
        let map = rows
            .into_iter()
            .map(|row| -> Result<(EventId, ReactionSummary), DbErr> {
                let event_id = row.try_get_by(0)?;
                let positive_count = row.try_get_by(1)?;
                let negative_count = row.try_get_by(2)?;
                Ok((
                    event_id,
                    ReactionSummary {
                        upvote_count: positive_count,
                        downvote_count: negative_count,
                    },
                ))
            })
            .collect::<Result<HashMap<_, _>, _>>()?;
        Ok(map)
    }

    /// Get our estimate for the count of each `(emoji, positive)` reaction to
    /// the events specified by `event_keys`.
    /// Up to `limit` rows will be returned for each event key ordered by most
    /// popular to least.
    pub async fn tally_reactions(
        db: &DbConn,
        event_ids: impl ExactSizeIterator<Item = EventId>,
    ) -> Result<HashMap<EventId, Vec<ReactionTally>>, DbErr> {
        if event_ids.len() == 0 {
            return Ok(HashMap::new());
        }

        let mut query = SelectStatement::new();
        query
            .from(reaction_model::Entity)
            .expr_as(
                Expr::col(reaction_model::Column::OnPost.as_column_ref()),
                "on_post",
            )
            .expr_as(
                Expr::col(reaction_model::Column::Emoji.as_column_ref()),
                "emoji",
            )
            .expr_as(
                Expr::col(reaction_model::Column::Positive.as_column_ref()),
                "positive",
            )
            .expr_as(Expr::from(Func::count(Expr::col(Asterisk))), "count")
            .cond_where(
                Expr::col(reaction_model::Column::OnPost.as_column_ref())
                    .is_in(event_ids),
            )
            .and_where(
                Expr::col(reaction_model::Column::Emoji.as_column_ref())
                    .is_not_null(),
            )
            .group_by_columns([
                reaction_model::Column::OnPost.as_column_ref(),
                reaction_model::Column::Emoji.as_column_ref(),
                reaction_model::Column::Positive.as_column_ref(),
            ])
            .order_by_columns([
                (
                    ColumnRef::from(
                        reaction_model::Column::OnPost.as_column_ref(),
                    ),
                    Order::Desc,
                ),
                (ColumnRef::from("count"), Order::Desc),
                (
                    ColumnRef::from(
                        reaction_model::Column::Emoji.as_column_ref(),
                    ),
                    Order::Desc,
                ),
                (
                    ColumnRef::from(
                        reaction_model::Column::Positive.as_column_ref(),
                    ),
                    Order::Desc,
                ),
            ]);

        let rows = db.query_all(&query).await?;
        let mut map = HashMap::new();
        for row in rows {
            let on_post = row.try_get_by(0)?;
            let tally = ReactionTally {
                emoji: row.try_get_by(1)?,
                positive: row.try_get_by(2)?,
                count: row.try_get_by(3)?,
            };
            let reactions: &mut Vec<ReactionTally> =
                map.entry(on_post).or_default();
            let idx = reactions.binary_search_by(|r| {
                (tally.count, &*tally.emoji, tally.positive)
                    .cmp(&(r.count, &*r.emoji, r.positive))
            });
            match idx {
                Ok(idx) | Err(idx) => reactions.insert(idx, tally),
            }
        }
        Ok(map)
    }
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

    /// Increment the upvote/downvote count for an out-of-network (URL)
    /// reaction, creating the summary row with a count of 1 if none exists yet.
    /// Mirrors `count_reaction_for` but keyed by URL.
    pub async fn count_attributed_reaction_for(
        db: &DbConn,
        url: String,
        positive: bool,
    ) -> Result<(), DbErr> {
        let (upvote, downvote) = if positive { (1, 0) } else { (0, 1) };

        let count_col = if positive {
            AttributedSummaryModel::Column::UpvoteCount
        } else {
            AttributedSummaryModel::Column::DownvoteCount
        };

        AttributedSummaryModel::Entity::insert(
            AttributedSummaryModel::ActiveModel {
                url: Set(url),
                upvote_count: Set(upvote),
                downvote_count: Set(downvote),
            },
        )
        .on_conflict(
            OnConflict::column(AttributedSummaryModel::Column::Url)
                .value(
                    count_col,
                    Expr::col((AttributedSummaryModel::Entity, count_col))
                        .add(1),
                )
                .to_owned(),
        )
        .exec(db)
        .await?;

        Ok(())
    }

    /// Decrement the upvote/downvote count for an out-of-network (URL)
    /// reaction, only when that count is greater than zero.
    pub async fn remove_attributed_reaction_for(
        db: &DbConn,
        url: String,
        positive: bool,
    ) -> Result<(), DbErr> {
        let count_col = if positive {
            AttributedSummaryModel::Column::UpvoteCount
        } else {
            AttributedSummaryModel::Column::DownvoteCount
        };

        AttributedSummaryModel::Entity::update_many()
            .col_expr(count_col, Expr::col(count_col).sub(1))
            .filter(
                AttributedSummaryModel::Column::Url
                    .eq(url)
                    .and(count_col.gt(0)),
            )
            .exec(db)
            .await?;

        Ok(())
    }

    /// Read the maintained `(upvote, downvote)` counts for a URL; `(0, 0)` if
    /// no reactions have been recorded for it yet.
    pub async fn get_attributed_reaction_summary(
        db: &DbConn,
        url: &str,
    ) -> Result<(i64, i64), DbErr> {
        let row = AttributedSummaryModel::Entity::find_by_id(url.to_owned())
            .one(db)
            .await?;
        Ok(row
            .map(|r| (r.upvote_count, r.downvote_count))
            .unwrap_or((0, 0)))
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

pub struct ReactionSummary {
    pub upvote_count: i64,
    pub downvote_count: i64,
}

pub struct ReactionTally {
    pub emoji: String,
    pub positive: bool,
    pub count: i64,
}
