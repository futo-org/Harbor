use chrono::DateTime;
use sea_orm::ColumnTrait;
use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::sea_query::{DynIden, Expr, SelectStatement};

pub const EVENT_PREFIX: &str = "event_";
pub const CONTENT_PREFIX: &str = "content_";

/// Adds all columns in `columns` to the select list of `query`, with an alias
/// using "`prefix``column_name`".
///
/// See the `*_PREFIX` constant for some commonly used prefixes.
pub fn select_model_columns(
    query: &mut SelectStatement,
    prefix: &str,
    columns: impl Iterator<Item = impl ColumnTrait>,
) {
    for column in columns {
        let (table, column) = column.as_column_ref();
        let alias = DynIden::from(format!("{prefix}{column}"));
        query.expr_as(Expr::col((table, column)), alias);
    }
}

/// ms since the Unix epoch to a timestamp. `None` if it's out of range
pub fn timestamp_from_millis(millis: u64) -> Option<DateTimeWithTimeZone> {
    let at = DateTime::from_timestamp_millis(i64::try_from(millis).ok()?)?;
    Some(at.fixed_offset())
}
