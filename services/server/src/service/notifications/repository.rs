use ::entity::{notification, notification_read_marker};
use sea_orm::sea_query::OnConflict;
use sea_orm::*;

pub struct Query;
pub struct Mutation;

impl Query {
    /// Notifications addressed to `identity` newer than its read marker,
    /// counted up to `cap`.
    pub async fn unread_count(
        db: &DbConn,
        identity: &str,
        cap: u64,
    ) -> Result<u64, DbErr> {
        let last_read_id =
            notification_read_marker::Entity::find_by_id(identity)
                .one(db)
                .await?
                .map(|marker| marker.last_read_id)
                .unwrap_or(0);

        let ids: Vec<i64> = notification::Entity::find()
            .select_only()
            .column(notification::Column::Id)
            .filter(notification::Column::ToIdentity.eq(identity))
            .filter(notification::Column::Id.gt(last_read_id))
            .limit(cap)
            .into_tuple()
            .all(db)
            .await?;

        Ok(ids.len() as u64)
    }

    /// Notifications addressed to `to_identity`, newest first.
    pub async fn list_for_identity(
        db: &DbConn,
        to_identity: &str,
        limit: u64,
        after_id: Option<i64>,
    ) -> Result<Vec<notification::Model>, DbErr> {
        let mut query = notification::Entity::find()
            .filter(notification::Column::ToIdentity.eq(to_identity))
            .order_by_desc(notification::Column::Id)
            .limit(limit);

        if let Some(after) = after_id {
            query = query.filter(notification::Column::Id.lt(after));
        }

        query.all(db).await
    }
}

impl Mutation {
    /// Moves `identity`'s read marker to its newest notification.
    pub async fn mark_read(db: &DbConn, identity: &str) -> Result<(), DbErr> {
        let newest_id: Option<i64> = notification::Entity::find()
            .select_only()
            .column(notification::Column::Id)
            .filter(notification::Column::ToIdentity.eq(identity))
            .order_by_desc(notification::Column::Id)
            .into_tuple()
            .one(db)
            .await?;

        let now = chrono::Utc::now();
        notification_read_marker::Entity::insert(
            notification_read_marker::ActiveModel {
                identity: Set(identity.to_string()),
                last_read_id: Set(newest_id.unwrap_or(0)),
                updated_at: Set(now),
            },
        )
        .on_conflict(
            OnConflict::column(notification_read_marker::Column::Identity)
                .update_columns([
                    notification_read_marker::Column::LastReadId,
                    notification_read_marker::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec_without_returning(db)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DatabaseBackend, MockDatabase, MockExecResult, Value};
    use std::collections::BTreeMap;

    fn sample_row(id: i64, kind: i32) -> notification::Model {
        let ts = chrono::DateTime::from_timestamp(0, 0).unwrap();
        notification::Model {
            id,
            kind,
            from_identity: "alice".to_string(),
            to_identity: "bob".to_string(),
            trigger_event_key_collection: 2,
            trigger_event_key_identity: "alice".to_string(),
            trigger_event_key_public_key_type: 1,
            trigger_event_key_public_key: vec![0xAB],
            trigger_event_key_sequence: 7,
            target_event_key_collection: 0,
            target_event_key_identity: String::new(),
            target_event_key_public_key_type: 0,
            target_event_key_public_key: Vec::new(),
            target_event_key_sequence: 0,
            created_at: ts,
            updated_at: ts,
        }
    }

    #[tokio::test]
    async fn returns_rows_mapped_with_kind() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![sample_row(2, 2), sample_row(1, 1)]])
            .into_connection();

        let rows = Query::list_for_identity(&db, "bob", 50, None)
            .await
            .expect("query should succeed");

        assert_eq!(rows.len(), 2);
        // `kind` in particular must survive the read (it regressed once).
        assert_eq!((rows[0].id, rows[0].kind), (2, 2));
        assert_eq!((rows[1].id, rows[1].kind), (1, 1));
    }

    #[tokio::test]
    async fn without_cursor_filters_orders_and_limits() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<notification::Model>::new()])
            .into_connection();

        Query::list_for_identity(&db, "bob", 25, None)
            .await
            .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("to_identity"), "filters by recipient: {sql}");
        assert!(
            sql.contains("ORDER BY") && sql.contains("DESC"),
            "newest first: {sql}"
        );
        assert!(sql.to_uppercase().contains("LIMIT"), "bounded: {sql}");
        // The cursor predicate (`id < ?`) is the only `<` in the query.
        assert!(
            !sql.contains('<'),
            "no cursor predicate without after: {sql}"
        );
    }

    #[tokio::test]
    async fn with_cursor_adds_id_upper_bound() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<notification::Model>::new()])
            .into_connection();

        Query::list_for_identity(&db, "bob", 25, Some(100))
            .await
            .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains('<'), "cursor adds an id upper-bound: {sql}");
    }

    fn id_row(id: i64) -> BTreeMap<&'static str, Value> {
        BTreeMap::from([("id", Value::BigInt(Some(id)))])
    }

    fn marker(
        identity: &str,
        last_read_id: i64,
    ) -> notification_read_marker::Model {
        notification_read_marker::Model {
            identity: identity.to_string(),
            last_read_id,
            updated_at: chrono::DateTime::from_timestamp(0, 0).unwrap(),
        }
    }

    #[tokio::test]
    async fn unread_count_counts_ids_above_the_marker() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![marker("bob", 5)]])
            .append_query_results([vec![id_row(7), id_row(6)]])
            .into_connection();

        let count = Query::unread_count(&db, "bob", 100).await.unwrap();

        assert_eq!(count, 2);
        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("to_identity"), "filters by recipient: {sql}");
        assert!(sql.contains('>'), "only ids above the marker: {sql}");
        assert!(sql.to_uppercase().contains("LIMIT"), "capped: {sql}");
    }

    #[tokio::test]
    async fn unread_count_without_a_marker_counts_everything() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([
                Vec::<notification_read_marker::Model>::new(),
            ])
            .append_query_results([vec![id_row(1)]])
            .into_connection();

        let count = Query::unread_count(&db, "bob", 100).await.unwrap();

        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn mark_read_upserts_the_newest_id() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![id_row(42)]])
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        Mutation::mark_read(&db, "bob").await.unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("ON CONFLICT"), "upserts the marker: {sql}");
        assert!(
            sql.contains("BigInt(Some(42))"),
            "stores the newest id: {sql}"
        );
    }

    #[tokio::test]
    async fn mark_read_without_notifications_stores_zero() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<BTreeMap<&str, Value>>::new()])
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        Mutation::mark_read(&db, "bob").await.unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("BigInt(Some(0))"), "stores zero: {sql}");
    }
}
