use crate::service::feeds::repository::content_join;
use crate::service::proto::{SortPostsBy, SortUsersBy};
use crate::service::search::rpc::search_posts::SortedPostsBy;
use crate::service::search::rpc::search_users::SortedUsersBy;
use crate::service::search::rpc::{Cursor, CursorFilter, Marker};
use entity::{content_model, event_model};
use sea_orm::prelude::*;
use sea_orm::sea_query::{Expr, Order, Value};
use sea_orm::{
    ConnectionTrait, EntityTrait, FromQueryResult, Iterable, JoinType,
    QueryFilter, QueryOrder, QueryResult, QuerySelect, RelationTrait,
    TryGetError, TryGetableMany,
};
use std::collections::HashMap;
use tonic::Status;

// This type only exists to work around trying to get additional columns (e.g.
// the search rank) from SeaORM.
#[derive(Debug)]
pub struct SearchUsersEvent {
    pub event: event_model::Model,
    pub content: content_model::Model,
    pub search_rank: f32,
    pub profile_name: String,
}

impl TryGetableMany for SearchUsersEvent {
    fn try_get_many(
        res: &QueryResult,
        _: &str,
        _: &[String],
    ) -> Result<Self, TryGetError> {
        Self::try_get_many_by_index(res)
    }

    fn try_get_many_by_index(res: &QueryResult) -> Result<Self, TryGetError> {
        Ok(SearchUsersEvent {
            event: FromQueryResult::from_query_result(res, "event_")?,
            content: FromQueryResult::from_query_result(res, "content_")?,
            search_rank: res.try_get_by("search_rank")?,
            profile_name: res.try_get_by("profile_name")?,
        })
    }
}

// This type only exists to work around trying to get additional columns (e.g.
// the search rank) from SeaORM.
#[derive(Debug)]
pub struct SearchPostsEvent {
    pub event: event_model::Model,
    pub content: content_model::Model,
    pub search_rank: f32,
}

impl TryGetableMany for SearchPostsEvent {
    fn try_get_many(
        res: &QueryResult,
        _: &str,
        _: &[String],
    ) -> Result<Self, TryGetError> {
        Self::try_get_many_by_index(res)
    }

    fn try_get_many_by_index(res: &QueryResult) -> Result<Self, TryGetError> {
        Ok(SearchPostsEvent {
            event: FromQueryResult::from_query_result(res, "event_")?,
            content: FromQueryResult::from_query_result(res, "content_")?,
            search_rank: res.try_get_by("search_rank")?,
        })
    }
}

pub struct Query;

impl Query {
    pub(super) async fn search_users<C: ConnectionTrait>(
        db: &C,
        search_query: &str,
        sort_by: SortUsersBy,
        limit: u64,
        cursor_filter: Option<&CursorFilter<SortedUsersBy>>,
    ) -> Result<Vec<SearchUsersEvent>, Status> {
        let cursor_filter =
            cursor_filter.unwrap_or(&CursorFilter::Forward(Cursor::Start));

        let mut query = event_model::Entity::find().select_only();
        query = add_model_columns(
            query,
            "event",
            entity::event_model::Column::iter(),
        );
        query = add_model_columns(
            query,
            "content",
            entity::content_model::Column::iter(),
        );
        query = query
            // TODO: could make this optional if the default sorting is not
            // used.
            // TODO: we can use ts_rank_cd as well here.
            .expr_as(
                Expr::cust(
                    "ts_rank(search_data, websearch_to_tsquery('simple', $1))",
                ),
                "search_rank",
            )
            .expr_as(Expr::cust("content_profile_update.name"), "profile_name")
            .join(JoinType::InnerJoin, content_join())
            .join(
                JoinType::InnerJoin,
                content_model::Relation::ContentProfileUpdateModel.def(),
            )
            .filter(Expr::cust_with_values(
                "search_data @@ websearch_to_tsquery('simple', $1)",
                [search_query],
            ));

        match cursor_filter {
            CursorFilter::Forward(cur) => {
                match cur {
                    Cursor::Start => {
                        // TODO: use order by column here.
                        QueryOrder::query(&mut query)
                            .order_by_expr(
                                Expr::cust("search_rank"),
                                Order::Asc,
                            )
                            .order_by_expr(Expr::cust("events.id"), Order::Asc);
                    }
                    Cursor::Mid(marker) => {
                        if !marker.sorted_by.matches(sort_by) {
                            return Err(Status::internal(
                                "wrong combination of sort_by and pagination parameters",
                            ));
                        }
                        query = match marker {
                            Marker {
                                sorted_by: SortedUsersBy::Rank(rank),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(search_rank, events.id) >= ($2, $3)",
                                [Value::from(rank), Value::from(id)],
                            )),
                            Marker {
                                sorted_by: SortedUsersBy::Name(name),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(name, events.id) >= ($2, $3)",
                                [Value::from(name), Value::from(id)],
                            )),
                        };
                    }
                    Cursor::End => return Ok(Vec::new()),
                }
            }
            CursorFilter::Backward(cur) => {
                match cur {
                    Cursor::Start => return Ok(Vec::new()),
                    Cursor::Mid(marker) => {
                        if !marker.sorted_by.matches(sort_by) {
                            return Err(Status::internal(
                                "wrong combination of sort_by and pagination parameters",
                            ));
                        }

                        query = match marker {
                            Marker {
                                sorted_by: SortedUsersBy::Rank(rank),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(search_rank, events.id) <= ($2, $3)",
                                [Value::from(rank), Value::from(id)],
                            )),
                            Marker {
                                sorted_by: SortedUsersBy::Name(name),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(name, events.id) <= ($2, $3)",
                                [Value::from(name), Value::from(id)],
                            )),
                        };
                    }
                    Cursor::End => {
                        // TODO: use order by column here.
                        QueryOrder::query(&mut query)
                            .order_by_expr(
                                Expr::cust("search_rank"),
                                Order::Desc,
                            )
                            .order_by_expr(
                                Expr::cust("events.id"),
                                Order::Desc,
                            );
                    }
                }
            }
        }
        query = query.limit(limit + 1); // + 1 for pagination.

        let rows: Vec<SearchUsersEvent> =
            query.into_tuple().all(db).await.map_err(|err| {
                log::warn!("failed to search for users: {err}");
                Status::internal("internal server error")
            })?;

        // Keep the highest sequence row per identity.
        let mut seen: HashMap<String, SearchUsersEvent> = HashMap::new();
        for row in rows {
            if let Some(current) = seen.get_mut(&row.event.identity) {
                if row.event.sequence > current.event.sequence {
                    *current = row;
                }
            } else {
                seen.insert(row.event.identity.clone(), row);
            }
        }
        Ok(seen.into_values().collect())
    }

    pub(super) async fn search_posts<C: ConnectionTrait>(
        db: &C,
        search_query: &str,
        sort_by: SortPostsBy,
        limit: u64,
        cursor_filter: Option<&CursorFilter<SortedPostsBy>>,
    ) -> Result<Vec<SearchPostsEvent>, Status> {
        let cursor_filter =
            cursor_filter.unwrap_or(&CursorFilter::Forward(Cursor::Start));

        let mut query = event_model::Entity::find().select_only();
        query = add_model_columns(
            query,
            "event",
            entity::event_model::Column::iter(),
        );
        query = add_model_columns(
            query,
            "content",
            entity::content_model::Column::iter(),
        );
        query = query
            // TODO: could make this optional if the default sorting is not
            // used.
            // TODO: we can use ts_rank_cd as well here.
            .expr_as(
                Expr::cust(
                    "ts_rank(search_data, websearch_to_tsquery('simple', $1))",
                ),
                "search_rank",
            )
            .join(JoinType::InnerJoin, content_join())
            .join(
                JoinType::InnerJoin,
                content_model::Relation::ContentPostModel.def(),
            )
            .filter(Expr::cust_with_values(
                "search_data @@ websearch_to_tsquery('simple', $1)",
                [search_query],
            ));

        match cursor_filter {
            CursorFilter::Forward(cur) => {
                match cur {
                    Cursor::Start => {
                        // TODO: use order by column here.
                        QueryOrder::query(&mut query)
                            .order_by_expr(
                                Expr::cust("search_rank"),
                                Order::Asc,
                            )
                            .order_by_expr(Expr::cust("events.id"), Order::Asc);
                    }
                    Cursor::Mid(marker) => {
                        if !marker.sorted_by.matches(sort_by) {
                            return Err(Status::internal(
                                "wrong combination of sort_by and pagination parameters",
                            ));
                        }
                        query = match marker {
                            Marker {
                                sorted_by: SortedPostsBy::Rank(rank),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(search_rank, events.id) >= ($2, $3)",
                                [Value::from(rank), Value::from(id)],
                            )),
                            Marker {
                                sorted_by: SortedPostsBy::Latest(synced_at),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(content_synced_at, events.id) >= ($2, $3)",
                                [Value::from(*synced_at), Value::from(id)],
                            )),
                        };
                    }
                    Cursor::End => return Ok(Vec::new()),
                }
            }
            CursorFilter::Backward(cur) => {
                match cur {
                    Cursor::Start => return Ok(Vec::new()),
                    Cursor::Mid(marker) => {
                        if !marker.sorted_by.matches(sort_by) {
                            return Err(Status::internal(
                                "wrong combination of sort_by and pagination parameters",
                            ));
                        }

                        query = match marker {
                            Marker {
                                sorted_by: SortedPostsBy::Rank(rank),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(search_rank, events.id) <= ($2, $3)",
                                [Value::from(rank), Value::from(id)],
                            )),
                            Marker {
                                sorted_by: SortedPostsBy::Latest(synced_at),
                                id,
                            } => query.filter(Expr::cust_with_values(
                                "(content_synced_at, events.id) <= ($2, $3)",
                                [Value::from(*synced_at), Value::from(id)],
                            )),
                        };
                    }
                    Cursor::End => {
                        // TODO: use order by column here.
                        QueryOrder::query(&mut query)
                            .order_by_expr(
                                Expr::cust("search_rank"),
                                Order::Desc,
                            )
                            .order_by_expr(
                                Expr::cust("events.id"),
                                Order::Desc,
                            );
                    }
                }
            }
        }
        query = query.limit(limit + 1); // + 1 for pagination.

        let rows: Vec<SearchPostsEvent> =
            query.into_tuple().all(db).await.map_err(|err| {
                log::warn!("failed to search for users: {err}");
                Status::internal("internal server error")
            })?;

        // Keep the highest sequence row per identity.
        let mut seen: HashMap<String, SearchPostsEvent> = HashMap::new();
        for row in rows {
            if let Some(current) = seen.get_mut(&row.event.identity) {
                if row.event.sequence > current.event.sequence {
                    *current = row;
                }
            } else {
                seen.insert(row.event.identity.clone(), row);
            }
        }
        Ok(seen.into_values().collect())
    }
}

fn add_model_columns<Q: QuerySelect>(
    mut query: Q,
    prefix: &str,
    columns: impl Iterator<Item = impl ColumnTrait>,
) -> Q {
    for column in columns {
        let (table, column) = column.as_column_ref();
        let alias = format!("{prefix}_{column}");
        query = query.tbl_col_as((table, column), alias);
    }
    query
}
