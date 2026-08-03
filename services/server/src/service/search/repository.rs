use crate::service::feeds::repository::{EventWithContentRow, content_join};
use crate::service::identity::service::row_to_bundle;
use crate::service::proto::{EventBundle, SearchUsersRequest, SortUsersBy};
use entity::{content_model, content_profile_update_model, event_model};
use sea_orm::sea_query::{Expr, Order};
use sea_orm::{
    ConnectionTrait, DbErr, EntityTrait, JoinType, QueryFilter, QueryOrder,
    QuerySelect, RelationTrait,
};
use std::collections::HashMap;

pub struct Query;

impl Query {
    pub(super) async fn search_users<C: ConnectionTrait>(
        db: &C,
        search: &SearchUsersRequest,
    ) -> Result<Vec<EventBundle>, DbErr> {
        let mut query = event_model::Entity::find()
            .select_also(content_model::Entity)
            .join(JoinType::InnerJoin, content_join())
            .join(
                JoinType::InnerJoin,
                content_model::Relation::ContentProfileUpdateModel.def(),
            )
            .filter(Expr::cust_with_values(
                "search_data @@ websearch_to_tsquery($1)",
                [&search.query],
            ));

        let query = match search.sort_by() {
            SortUsersBy::Default => {
                // TODO: we can use ts_rank_cd as well here.
                QueryOrder::query(&mut query).order_by_expr(
                    Expr::cust(
                        "ts_rank(search_data, websearch_to_tsquery($1))",
                    ),
                    Order::Asc,
                );
                query
            }
            SortUsersBy::Alpha => query.order_by(
                content_profile_update_model::Column::Name,
                Order::Asc,
            ),
            SortUsersBy::Popular => {
                // TODO: determine popularity metric.
                query
            }
        };

        let rows = query.all(db).await?;

        // Keep the highest sequence row per identity.
        let mut seen: HashMap<String, EventWithContentRow> = HashMap::new();
        for row in rows {
            if let Some(current) = seen.get_mut(&row.0.identity) {
                if row.0.sequence > current.0.sequence {
                    *current = row;
                }
            } else {
                seen.insert(row.0.identity.clone(), row);
            }
        }
        Ok(seen.into_values().map(row_to_bundle).collect())
    }
}
