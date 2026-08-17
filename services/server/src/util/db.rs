use sea_orm::{ColumnTrait, QuerySelect};

pub const EVENT_PREFIX: &str = "event_";
pub const CONTENT_PREFIX: &str = "content_";

/// Adds all columns in `columns` to the select list of `query`, with an alias
/// using "`prefix``column_name`".
///
/// See the `*_PREFIX` constant for some commonly used prefixes.
pub fn select_model_columns<Q: QuerySelect>(
    mut query: Q,
    prefix: &str,
    columns: impl Iterator<Item = impl ColumnTrait>,
) -> Q {
    for column in columns {
        let (table, column) = column.as_column_ref();
        let alias = format!("{prefix}{column}");
        query = query.tbl_col_as((table, column), alias);
    }
    query
}
