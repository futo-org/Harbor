//! Cron job that updates gravity value.

use std::ops::ControlFlow;

use entity::{
    event_model, gravity_model, reaction_model, reaction_tally_model2,
};
use sea_orm::sea_query::{
    Asterisk, CommonTableExpression, Expr, Func, SelectStatement,
    UpdateStatement, WithClause,
};
use sea_orm::{ColumnTrait, ConnectionTrait, DatabaseConnection, ExprTrait};

use crate::config;
use crate::cron::{AdvisoryLock, Cron};

pub(crate) fn update(cron: &Cron, db: DatabaseConnection) {
    let config = config::get();

    let feeds_gravity = config.feeds_gravity;
    let gravity_per_reaction = config.dynamic_feeds_gravity_per_reaction;
    let hours = config.dynamic_feeds_gravity_hours;
    let every = config.feed_count_update_frequency;
    cron.every(every, move || {
        tracing::debug!(gravity_per_reaction, hours, "updating gravity");
        let db = db.clone();
        async move {
            let tx = match AdvisoryLock::Gravity.try_lock(db).await {
                Ok(Some(tx)) => tx,
                // Another instance is doing the work.
                Ok(None) => return ControlFlow::Continue(()),
                Err(err) => {
                    tracing::warn!(error = %err, "failed acquire gravity lock");
                    return ControlFlow::Continue(());
                }
            };

            let mut reaction_count = SelectStatement::new();
            if let Some(gravity) = feeds_gravity {
                // Dynamic gravity disabled, use a static value
                reaction_count.expr_as(Expr::Constant(gravity.into()), "gravity");
            } else {
                // Calculate the dynamic gravity value.
                //
                // Get the total number of positive reactions made in the last
                // `hours` time.
                reaction_count
                    .expr_as(Func::count(Expr::col(Asterisk)), "gravity")
                    .from(reaction_model::Entity)
                    .inner_join(
                        event_model::Entity,
                        Expr::col(event_model::Column::Id.as_column_ref())
                            .equals(
                                reaction_model::Column::EventId
                                    .as_column_ref(),
                            ),
                    )
                    .cond_where(ExprTrait::eq(
                        Expr::col(
                            reaction_model::Column::Positive
                                .as_column_ref(),
                        ),
                        Expr::Constant(true.into()),
                    ))
                    .cond_where(ExprTrait::gte(
                        Expr::col(
                            event_model::Column::CreatedAt.as_column_ref(),
                        ),
                        Expr::current_timestamp().sub(Expr::cust(format!(
                            "INTERVAL '{hours} hours'"
                        ))),
                    ));
            }

            // Update the gravity value and calculation timestamp.
            let mut update_gravity = UpdateStatement::new();
            update_gravity.table(gravity_model::Entity)
                .value(
                    gravity_model::Column::Value,
                    // Make sure we don't have a zero value.
                    Func::greatest([
                        Expr::from(reaction_count),
                        Expr::Constant(1.into()),
                    ])
                    .cast_as("NUMERIC(20,11)")
                    .mul(Expr::Constant(gravity_per_reaction.into())),
                )
                .value(
                    gravity_model::Column::CalculatedAt,
                    Expr::current_timestamp(),
                )
                .returning_all();

            let mut with = WithClause::new();
            let mut cte = CommonTableExpression::new();
            cte.table_name(gravity_model::Entity).query(update_gravity);
            with.recursive(false).cte(cte);

            // Update all calculated decayed counts.
            let mut query = UpdateStatement::new();
            query
                .table(reaction_tally_model2::Entity)
                .from(gravity_model::Entity)
                .value(
                    reaction_tally_model2::Column::DecayedCount,
                    {
                        Func::cust("reaction_count_decay")
                        .args([
                            Expr::col(reaction_tally_model2::Column::PositiveCount.as_column_ref()),
                            Expr::col(event_model::Column::CreatedAt.as_column_ref()),
                            Expr::col(gravity_model::Column::Value.as_column_ref()),
                            Expr::col(gravity_model::Column::CalculatedAt.as_column_ref()),
                        ])
                    },
                )
                // If the decayed count was previously already zero there is no
                // point in calculating it again as it can only go lower.
                .cond_where(Expr::col(reaction_tally_model2::Column::DecayedCount.as_column_ref()).gt(Expr::Constant(0.0.into())))
                // This should be an inner join, but SeaORM doesn't support this,
                // see <https://github.com/SeaQL/sea-query/issues/608>.
                .from(event_model::Entity)
                .and_where(
                    Expr::col(event_model::Column::Id.as_column_ref())
                        .eq(Expr::col(reaction_tally_model2::Column::EventId.as_column_ref())),
                );
            let query = query.with(with);

            if let Err(err) = tx.execute(&query).await {
                tracing::warn!(error = %err, "failed to update gravity calculations");
            }
            if let Err(err) = tx.commit().await {
                tracing::warn!(error = %err, "failed to commit gravity changes");
            }

            ControlFlow::Continue(())
        }
    });
}
