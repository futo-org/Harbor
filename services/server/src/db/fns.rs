//! SQL functions.

use sea_orm::sea_query::{Expr, ExprTrait, Func};

/// Call `decay_interaction_count` with individual columns.
pub(crate) fn decay_interaction_count(
    reaction_positive_count: Expr,
    reply_count: Expr,
    repost_count: Expr,
    quote_count: Expr,
    created_at: Expr,
) -> Expr {
    decay_interaction_count1(
        reaction_positive_count
            .add(reply_count)
            .add(repost_count)
            .add(quote_count),
        created_at,
    )
}

/// Call `decay_interaction_count` with a total count.
pub(crate) fn decay_interaction_count1(
    total_count: Expr,
    created_at: Expr,
) -> Expr {
    Func::cust("decay_interaction_count")
        .args([total_count, created_at])
        .into()
}
