//! Cron job that updates gravity value.

use std::ops::ControlFlow;
use std::time::Instant;

use entity::{event, gravity, reaction, reaction_tally};
use sea_orm::sea_query::{
    Asterisk, CommonTableExpression, Expr, Func, Order, SelectStatement,
    UpdateStatement, WithClause,
};
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, ExprTrait,
    TransactionTrait,
};

use crate::config;
use crate::cron::{AdvisoryLock, Cron};

const BATCH_SIZE: u64 = 1000;

pub(crate) fn update(cron: &Cron, db: DatabaseConnection) {
    let config = config::get();
    let gravity = config.feeds_gravity;
    let gravity_per_reaction = config.dynamic_feeds_gravity_per_reaction;
    let hours = config.dynamic_feeds_gravity_hours;
    let every = config.feed_count_update_frequency;
    let expire = config.feeds_gravity_expire;
    cron.every(every, move || {
        tracing::debug!(gravity_per_reaction, hours, "updating gravity");
        let db = db.clone();
        async move {
            let start = Instant::now();

            // First we need to update the gravity calculate timestamp, and if
            // we're using dynamic gravity calculate the gravity value.
            //
            // NOTE: we do this is in a separate transaction because the
            // gravity table is used by `reaction_count_decay` and when we
            // update it, while also updating all the decayed counts it
            // means we lock out creation of reaction events. This caused
            // #292.
            //
            // This does mean that between the time this transaction commits
            // and the recalculation transaction below commits the decayed
            // counts are technically incorrect. Furthermore if the
            // recalculation job, for whatever reason, doesn't finish the counts
            // will remain incorrect.
            //
            // Luckily this job should run pretty often so it's a time
            // window of a couple of minutes were this could be the case.

            let tx = match AdvisoryLock::Gravity.try_lock(&db).await {
                Ok(Some(tx)) => tx,
                // Another instance is doing the work.
                Ok(None) => return ControlFlow::Continue(()),
                Err(err) => {
                    tracing::warn!(error = %err, "failed acquire gravity lock");
                    return ControlFlow::Continue(());
                }
            };

            let mut gravity_value = SelectStatement::new();
            if let Some(gravity) = gravity {
                gravity_value.expr_as(Expr::Constant(gravity.into()), "gravity");
            } else {
                // Calculate the dynamic gravity value.
                gravity_value
                    .expr_as(
                        // Make sure we don't divide by zero.
                        Func::greatest([
                            Expr::from(Func::count(Expr::col(Asterisk))),
                            Expr::Constant(1.into()),
                        ])
                        .cast_as("NUMERIC(20,11)")
                        .mul(Expr::Constant(gravity_per_reaction.into())),
                        "gravity",
                    )
                    .from(reaction::Entity)
                    .inner_join(
                        event::Entity,
                        Expr::col(event::Column::Id.as_column_ref())
                            .equals(
                                reaction::Column::EventId
                                    .as_column_ref(),
                            ),
                    )
                    .cond_where(ExprTrait::eq(
                        Expr::col(
                            reaction::Column::Positive
                                .as_column_ref(),
                        ),
                        Expr::Constant(true.into()),
                    ))
                    .cond_where(ExprTrait::gte(
                        Expr::col(
                            event::Column::CreatedAt.as_column_ref(),
                        ),
                        Expr::current_timestamp().sub(Expr::cust(format!(
                            "INTERVAL '{hours} hours'"
                        ))),
                    ));
            }

            // Update the gravity value and calculation timestamp.
            let mut update_gravity = UpdateStatement::new();
            update_gravity.table(gravity::Entity)
                .value(
                    gravity::Column::Value,
                    Expr::from(gravity_value),
                )
                .value(
                    gravity::Column::CalculatedAt,
                    Expr::current_timestamp(),
                )
                .value(
                    gravity::Column::ExpiresAt,
                    Expr::current_timestamp().sub(Expr::cust(format!(
                        "INTERVAL '{} seconds'", every.as_secs()
                    )))
                )
                // Don't update the value if it has been updated in the last
                // `every` time (e.g. in the last 5 minutes).
                .cond_where(
                    Expr::col(gravity::Column::CalculatedAt.as_column_ref())
                        .lt(Expr::current_timestamp().sub(Expr::cust(format!(
                            "INTERVAL '{} seconds'", every.as_secs()
                        ))))
                );

            match tx.execute(&update_gravity).await {
                Ok(result) if result.rows_affected() == 0 => {
                    tracing::debug!(elapsed = ?start.elapsed(), "gravity value not updated, skipping calculation of decayed reaction counts");
                    return ControlFlow::Continue(());
                }
                Ok(_) => { /* Update decayed reaction counts below. */ }
                Err(err) => {
                    tracing::warn!(error = %err, "failed to update gravity value & timestamp");
                    return ControlFlow::Continue(());
                },
            }
            if let Err(err) = tx.commit().await {
                tracing::warn!(error = %err, "failed to commit gravity value & timestamp changes");
                return ControlFlow::Continue(());
            }
            tracing::info!(elapsed = ?start.elapsed(), "updated gravity value");

            // NOTE: the updating the of the gravity value should ensure we're
            // the only cron job updating the decayed reaction counts.
            let start = Instant::now();
            let tx = match db.begin().await {
                Ok(tx) => tx,
                Err(err) => {
                    tracing::warn!(error = %err, "failed to start transaction to update decayed reaction counts");
                    return ControlFlow::Continue(());
                }
            };

            // The "current" timestamp we use so that all queries use the same
            // time, even though they're executed in different transactions and
            // such don't have the same time.
            let mut gravity_timestamp_query = SelectStatement::new();
            gravity_timestamp_query
                .column(gravity::Column::CalculatedAt)
                .from(gravity::Entity);

            // Update all the calculate decayed reaction counts for all
            // reactions in batches.
            let mut event_id = Some(i64::MAX);
            while let Some(e_id) = event_id {
                let start = Instant::now();
                let mut with = WithClause::new();

                // Select the event ids to update (need to use a SELECT here
                // because Postgres doesn't support a limit on UPDATE).
                let mut event_ids = SelectStatement::new();
                event_ids
                    .column(reaction_tally::Column::EventId)
                    .from(reaction_tally::Entity)
                    .and_where(Expr::col(reaction_tally::Column::EventId.as_column_ref()).lt(e_id))
                    // If the decayed count was previously already zero there is
                    // no point in calculating it again as it can only go lower.
                    .and_where(Expr::col(reaction_tally::Column::DecayedCount.as_column_ref()).gt(Expr::Constant(0.into())))
                    .order_by(reaction_tally::Column::EventId, Order::Desc)
                    .limit(BATCH_SIZE);

                // Update all calculated decayed counts.
                let mut update_tallies = UpdateStatement::new();
                update_tallies
                    .table(reaction_tally::Entity)
                    .value(
                        reaction_tally::Column::DecayedCount,
                        Func::cust("reaction_count_decay")
                        .args([
                            Expr::col(reaction_tally::Column::PositiveCount.as_column_ref()),
                            Expr::col(event::Column::CreatedAt.as_column_ref()),
                        ]),
                    )
                    .from(event::Entity)
                    .and_where(
                        Expr::col(event::Column::Id.as_column_ref())
                            .eq(Expr::col(reaction_tally::Column::EventId.as_column_ref())),
                    )
                    .and_where(Expr::col(reaction_tally::Column::EventId.as_column_ref()).in_subquery(event_ids))
                    // Ignore events that will be expired below.
                    .and_where(
                        Expr::col(event::Column::CreatedAt.as_column_ref()).gt(
                            Expr::from(gravity_timestamp_query.clone()).sub(
                                Expr::cust(format!("INTERVAL '{} seconds'", expire.as_secs())))
                            )
                    )
                    .returning_col(reaction_tally::Column::EventId);

                let mut cte = CommonTableExpression::new();
                const UPDATE_TALLY: &str = "update_tally";
                cte.table_name(UPDATE_TALLY).query(update_tallies);
                with.cte(cte);

                let mut query = SelectStatement::new();
                query
                    .expr(Expr::col(reaction_tally::Column::EventId).min())
                    .from(UPDATE_TALLY);
                let query = query.with(with);

                match tx.query_one(&query).await {
                    Ok(Some(result)) => event_id = result.try_get_by(0).unwrap_or(None),
                    Ok(None) => event_id = None, // No more batches.
                    Err(err) => {
                        tracing::warn!(error = %err, "failed to update decayed reaction counts");
                        return ControlFlow::Continue(());
                    }
                }

                // Commit this batch and start another transaction.
                if let Err(err) = tx.execute_unprepared("COMMIT AND CHAIN").await {
                    tracing::warn!(error = %err, "failed to commit decayed reaction counts changes");
                    return ControlFlow::Continue(());
                }
                tracing::debug!(elapsed = ?start.elapsed(), batch_size = BATCH_SIZE, "updated batch of decayed reaction counts");
            }

            // Expire all old events (set the decayed count to zero).
            let start_expire = Instant::now();
            let mut expire_tallies = UpdateStatement::new();
            expire_tallies
                .table(reaction_tally::Entity)
                .value(
                    reaction_tally::Column::DecayedCount,
                    Expr::Constant(0.into()),
                )
                .from(event::Entity)
                .and_where(
                    Expr::col(event::Column::Id.as_column_ref())
                        .eq(Expr::col(reaction_tally::Column::EventId.as_column_ref())),
                )
                .and_where(Expr::col(reaction_tally::Column::DecayedCount.as_column_ref()).gt(Expr::Constant(0.into())))
                .and_where(
                    Expr::col(event::Column::CreatedAt.as_column_ref()).lt(
                        Expr::from(gravity_timestamp_query).sub(
                            Expr::cust(format!("INTERVAL '{} seconds'", expire.as_secs())))
                        )
                );

            if let Err(err) =  tx.execute(&expire_tallies).await {
                tracing::warn!(error = %err, "failed to expire decayed reaction counts");
                return ControlFlow::Continue(());
            }

            // Commit the expiring of events.
            if let Err(err) = tx.commit().await {
                tracing::warn!(error = %err, "failed to commit decayed reaction counts expiring");
                return ControlFlow::Continue(());
            }
            tracing::debug!(elapsed = ?start_expire.elapsed(), expire = ?expire, "expired decayed reaction counts");

            let start_vacuum = Instant::now();
            if let Err(err) = db.execute_unprepared("VACUUM ANALYZE reaction_tally").await {
                tracing::warn!(error = %err, "failed to vacuum reaction tallies");
            }
            tracing::debug!(elapsed = ?start_vacuum.elapsed(), "vacuumed reaction tallies");

            tracing::info!(elapsed = ?start.elapsed(), "updated all decayed reaction counts");
            ControlFlow::Continue(())
        }
    });
}
