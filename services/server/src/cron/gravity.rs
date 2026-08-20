//! Cron job that updates gravity value.

use std::ops::ControlFlow;
use std::time::Duration;

use entity::{event_model, reaction_model};
use sea_orm::sea_query::{
    Asterisk, Expr, Func, SelectStatement, UpdateStatement,
};
use sea_orm::{ColumnTrait, ConnectionTrait, DatabaseConnection, ExprTrait};

use crate::config;
use crate::cron::{AdvisoryLock, Cron};

const EVERY: Duration = Duration::from_secs(10 * 60); // 10 minutes.

/// Start the repository updater.
pub(crate) fn start(cron: &Cron, db: DatabaseConnection) {
    let config = config::get();
    if config.feeds_gravity.is_some() {
        // Dynamic gravity disabled.
        return;
    }

    let gravity_per_reaction = config.dynamic_feeds_gravity_per_reaction;
    let hours = config.dynamic_feeds_gravity_hours;
    cron.every(EVERY, move || {
        tracing::debug!(gravity_per_reaction, hours, "updating gravity");
        let db = db.clone();
        async move {
            let tx = match AdvisoryLock::Gravity.try_lock(db).await {
                Ok(Some(tx)) => tx,
                // Another instance is doing the work.
                Ok(None) => return ControlFlow::Continue(()),
                Err(err) => {
                    tracing::warn!(error = %err, "failed acquire gravity value lock");
                    return ControlFlow::Continue(());
                }
            };

            // Get the total number of positive reactions made in the last `hours`
            // time.
            let mut reaction_count = SelectStatement::new();
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

            // Update the gravity value.
            let mut query = UpdateStatement::new();
            query.table("gravity").value(
                "value",
                // Make sure we don't have a zero value.
                Func::greatest([
                    Expr::from(reaction_count),
                    Expr::Constant(1.into()),
                ])
                .cast_as("NUMERIC(20,11)")
                .mul(Expr::Constant(gravity_per_reaction.into())),
            );

            if let Err(err) = tx.execute(&query).await {
                tracing::warn!(error = %err, "failed to update gravity value");
            }
            if let Err(err) = tx.commit().await {
                tracing::warn!(error = %err, "failed to update gravity value");
            }

            ControlFlow::Continue(())
        }
    });
}
