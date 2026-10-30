use std::collections::HashMap;

use entity::{attributed_to_reaction_summary, interaction_tally, reaction};
use sea_orm::ActiveValue::Set;
use sea_orm::sea_query::{
    Asterisk, ColumnRef, Expr, ExprTrait, Func, OnConflict, Order,
    SelectStatement,
};
use sea_orm::{ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter};

use crate::data::EventId;

pub struct Query;

impl Query {
    /// For each events in `events`, return the number of interactions it has as
    /// tallied by the [`interaction_tally`] table.
    pub async fn interactions<C: ConnectionTrait>(
        db: &C,
        event_ids: impl ExactSizeIterator<Item = EventId>,
    ) -> Result<HashMap<EventId, InteractionTally>, DbErr> {
        if event_ids.len() == 0 {
            return Ok(HashMap::new());
        }

        let mut query = SelectStatement::new();
        query
            .columns([
                interaction_tally::Column::EventId,
                interaction_tally::Column::ReactionPositiveCount,
                interaction_tally::Column::ReactionNegativeCount,
                interaction_tally::Column::ReplyCount,
                interaction_tally::Column::RepostCount,
                interaction_tally::Column::QuoteCount,
            ])
            .cond_where(
                Expr::col(interaction_tally::Column::EventId.as_column_ref())
                    .is_in(event_ids),
            )
            .from(interaction_tally::Entity);

        let rows = db.query_all(&query).await?;
        let map = rows
            .into_iter()
            .map(|row| -> Result<(EventId, InteractionTally), DbErr> {
                let event_id = row.try_get_by(0)?;
                let tally = InteractionTally {
                    reaction_positive: row.try_get_by(1)?,
                    reaction_negative: row.try_get_by(2)?,
                    replies: row.try_get_by(3)?,
                    reposts: row.try_get_by(4)?,
                    quotes: row.try_get_by(5)?,
                };
                Ok((event_id, tally))
            })
            .collect::<Result<HashMap<_, _>, _>>()?;
        Ok(map)
    }

    /// Get our estimate for the count of each `(emoji, positive)` reaction to
    /// the events specified by `event_keys`.
    /// Up to `limit` rows will be returned for each event key ordered by most
    /// popular to least.
    pub async fn tally_reactions<C: ConnectionTrait>(
        db: &C,
        event_ids: impl ExactSizeIterator<Item = EventId>,
    ) -> Result<HashMap<EventId, Vec<ReactionTally>>, DbErr> {
        if event_ids.len() == 0 {
            return Ok(HashMap::new());
        }

        let mut query = SelectStatement::new();
        query
            .from(reaction::Entity)
            .expr_as(
                Expr::col(reaction::Column::OnPost.as_column_ref()),
                "on_post",
            )
            .expr_as(
                Expr::col(reaction::Column::Emoji.as_column_ref()),
                "emoji",
            )
            .expr_as(
                Expr::col(reaction::Column::Positive.as_column_ref()),
                "positive",
            )
            .expr_as(Expr::from(Func::count(Expr::col(Asterisk))), "count")
            .cond_where(
                Expr::col(reaction::Column::OnPost.as_column_ref())
                    .is_in(event_ids),
            )
            .and_where(
                Expr::col(reaction::Column::Emoji.as_column_ref())
                    .is_not_null(),
            )
            .group_by_columns([
                reaction::Column::OnPost.as_column_ref(),
                reaction::Column::Emoji.as_column_ref(),
                reaction::Column::Positive.as_column_ref(),
            ])
            .order_by_columns([
                (
                    ColumnRef::from(reaction::Column::OnPost.as_column_ref()),
                    Order::Desc,
                ),
                (ColumnRef::from("count"), Order::Desc),
                (
                    ColumnRef::from(reaction::Column::Emoji.as_column_ref()),
                    Order::Desc,
                ),
                (
                    ColumnRef::from(reaction::Column::Positive.as_column_ref()),
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

    /// Read the maintained `(upvote, downvote)` counts for a URL; `(0, 0)` if
    /// no reactions have been recorded for it yet.
    pub async fn get_attributed_reaction_summary<C: ConnectionTrait>(
        db: &C,
        url: &str,
    ) -> Result<(i64, i64), DbErr> {
        let row =
            attributed_to_reaction_summary::Entity::find_by_id(url.to_owned())
                .one(db)
                .await?;
        let counts = row
            .map(|r| (r.upvote_count, r.downvote_count))
            .unwrap_or((0, 0));
        Ok(counts)
    }
}

pub struct Mutation;

impl Mutation {
    /// Increment the upvote/downvote count for an out-of-network (URL)
    /// reaction, creating the summary row with a count of 1 if none exists yet.
    /// Mirrors `count_reaction_for` but keyed by URL.
    pub async fn count_attributed_reaction_for<C: ConnectionTrait>(
        db: &C,
        url: String,
        positive: bool,
    ) -> Result<(), DbErr> {
        let (upvote, downvote) = if positive { (1, 0) } else { (0, 1) };

        let count_col = if positive {
            attributed_to_reaction_summary::Column::UpvoteCount
        } else {
            attributed_to_reaction_summary::Column::DownvoteCount
        };

        attributed_to_reaction_summary::Entity::insert(
            attributed_to_reaction_summary::ActiveModel {
                url: Set(url),
                upvote_count: Set(upvote),
                downvote_count: Set(downvote),
            },
        )
        .on_conflict(
            OnConflict::column(attributed_to_reaction_summary::Column::Url)
                .value(
                    count_col,
                    Expr::col((
                        attributed_to_reaction_summary::Entity,
                        count_col,
                    ))
                    .add(Expr::Constant(1.into())),
                )
                .to_owned(),
        )
        .exec(db)
        .await?;

        Ok(())
    }

    /// Decrement the upvote/downvote count for an out-of-network (URL)
    /// reaction, only when that count is greater than zero.
    pub async fn remove_attributed_reaction_for<C: ConnectionTrait>(
        db: &C,
        url: String,
        positive: bool,
    ) -> Result<(), DbErr> {
        let count_col = if positive {
            attributed_to_reaction_summary::Column::UpvoteCount
        } else {
            attributed_to_reaction_summary::Column::DownvoteCount
        };

        attributed_to_reaction_summary::Entity::update_many()
            .col_expr(count_col, Expr::col(count_col).sub(1))
            .filter(
                attributed_to_reaction_summary::Column::Url
                    .eq(url)
                    .and(count_col.gt(0)),
            )
            .exec(db)
            .await?;

        Ok(())
    }
}

pub struct InteractionTally {
    pub reaction_positive: i64,
    pub reaction_negative: i64,
    pub replies: i64,
    pub reposts: i64,
    pub quotes: i64,
}

pub struct ReactionTally {
    pub emoji: String,
    pub positive: bool,
    pub count: i64,
}
