use ::entity::{notification, notification_read_marker};
use sea_orm::sea_query::{Alias, Expr, Func, OnConflict};
use sea_orm::*;

use crate::service::events::TargetEventKey;

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

        let unread = sea_query::Query::select()
            .column(notification::Column::Id)
            .from(notification::Entity)
            .and_where(Expr::col(notification::Column::ToIdentity).eq(identity))
            .and_where(Expr::col(notification::Column::Id).gt(last_read_id))
            .limit(cap)
            .to_owned();
        let count = sea_query::Query::select()
            .expr(Expr::cust("COUNT(*) AS num_items"))
            .from_subquery(unread, Alias::new("unread"))
            .to_owned();

        match db.query_one(&count).await? {
            Some(row) => Ok(row.try_get::<i64>("", "num_items")? as u64),
            None => Ok(0),
        }
    }

    /// Id of the notification to `identity` that `trigger` produced, if this
    /// server has it. The newest one, since redelivery can duplicate rows.
    pub async fn id_of_trigger(
        db: &DbConn,
        identity: &str,
        trigger: &TargetEventKey,
    ) -> Result<Option<i64>, DbErr> {
        notification::Entity::find()
            .select_only()
            .column(notification::Column::Id)
            .filter(notification::Column::ToIdentity.eq(identity))
            .filter(
                notification::Column::TriggerEventKeyCollection
                    .eq(trigger.collection),
            )
            .filter(
                notification::Column::TriggerEventKeyIdentity
                    .eq(&trigger.identity),
            )
            .filter(
                notification::Column::TriggerEventKeyPublicKeyType
                    .eq(trigger.public_key_type),
            )
            .filter(
                notification::Column::TriggerEventKeyPublicKey
                    .eq(trigger.public_key.clone()),
            )
            .filter(
                notification::Column::TriggerEventKeySequence
                    .eq(trigger.sequence),
            )
            .order_by_desc(notification::Column::Id)
            .into_tuple()
            .one(db)
            .await
    }

    /// Id of the newest notification addressed to `identity`.
    pub async fn newest_id(
        db: &DbConn,
        identity: &str,
    ) -> Result<Option<i64>, DbErr> {
        notification::Entity::find()
            .select_only()
            .column(notification::Column::Id)
            .filter(notification::Column::ToIdentity.eq(identity))
            .order_by_desc(notification::Column::Id)
            .into_tuple()
            .one(db)
            .await
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
    /// Moves `identity`'s read marker up to `up_to_id`, never backwards.
    pub async fn mark_read(
        db: &DbConn,
        identity: &str,
        up_to_id: i64,
    ) -> Result<(), DbErr> {
        use notification_read_marker::Column;

        let now = chrono::Utc::now();
        notification_read_marker::Entity::insert(
            notification_read_marker::ActiveModel {
                identity: Set(identity.to_string()),
                last_read_id: Set(up_to_id),
                updated_at: Set(now),
            },
        )
        .on_conflict(
            OnConflict::column(Column::Identity)
                .value(
                    Column::LastReadId,
                    Func::greatest([
                        Expr::col((
                            notification_read_marker::Entity,
                            Column::LastReadId,
                        )),
                        Expr::col((Alias::new("excluded"), Column::LastReadId)),
                    ]),
                )
                .update_column(Column::UpdatedAt)
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

    fn count_row(count: i64) -> BTreeMap<&'static str, Value> {
        BTreeMap::from([("num_items", Value::BigInt(Some(count)))])
    }

    #[tokio::test]
    async fn unread_count_counts_ids_above_the_marker_in_sql() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![marker("bob", 5)]])
            .append_query_results([vec![count_row(2)]])
            .into_connection();

        let count = Query::unread_count(&db, "bob", 100).await.unwrap();

        assert_eq!(count, 2);
        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("COUNT(*)"), "counts in the database: {sql}");
        assert!(sql.contains("to_identity"), "filters by recipient: {sql}");
        assert!(sql.contains("BigInt(Some(5))"), "above the marker: {sql}");
        assert!(sql.contains('>'), "only ids above the marker: {sql}");
        assert!(sql.to_uppercase().contains("LIMIT"), "capped: {sql}");
    }

    #[tokio::test]
    async fn unread_count_without_a_marker_counts_everything() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([
                Vec::<notification_read_marker::Model>::new(),
            ])
            .append_query_results([vec![count_row(1)]])
            .into_connection();

        let count = Query::unread_count(&db, "bob", 100).await.unwrap();

        assert_eq!(count, 1);
        let sql = format!("{:?}", db.into_transaction_log());
        assert!(
            sql.contains("BigInt(Some(0))"),
            "marker defaults to 0: {sql}"
        );
    }

    fn trigger() -> TargetEventKey {
        TargetEventKey {
            collection: 2,
            identity: "alice".to_string(),
            public_key_type: 1,
            public_key: vec![0xAB],
            sequence: 7,
        }
    }

    #[tokio::test]
    async fn id_of_trigger_matches_every_key_column_for_the_recipient() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![id_row(9)]])
            .into_connection();

        let id = Query::id_of_trigger(&db, "bob", &trigger()).await.unwrap();

        assert_eq!(id, Some(9));
        let sql = format!("{:?}", db.into_transaction_log());
        for column in [
            "to_identity",
            "trigger_event_key_collection",
            "trigger_event_key_identity",
            "trigger_event_key_public_key_type",
            "trigger_event_key_public_key",
            "trigger_event_key_sequence",
        ] {
            assert!(sql.contains(column), "filters by {column}: {sql}");
        }
        assert!(
            sql.contains("ORDER BY") && sql.contains("DESC"),
            "newest duplicate wins: {sql}"
        );
    }

    #[tokio::test]
    async fn id_of_trigger_is_none_when_absent() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<BTreeMap<&str, Value>>::new()])
            .into_connection();

        let id = Query::id_of_trigger(&db, "bob", &trigger()).await.unwrap();

        assert_eq!(id, None);
    }

    #[tokio::test]
    async fn newest_id_takes_the_highest_id_for_the_recipient() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![id_row(42)]])
            .into_connection();

        let id = Query::newest_id(&db, "bob").await.unwrap();

        assert_eq!(id, Some(42));
        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("to_identity"), "filters by recipient: {sql}");
        assert!(
            sql.contains("ORDER BY") && sql.contains("DESC"),
            "newest first: {sql}"
        );
    }

    #[tokio::test]
    async fn mark_read_upserts_without_moving_backwards() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        Mutation::mark_read(&db, "bob", 42).await.unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("ON CONFLICT"), "upserts the marker: {sql}");
        assert!(sql.contains("GREATEST"), "keeps the higher id: {sql}");
        assert!(sql.contains("BigInt(Some(42))"), "stores the id: {sql}");
    }
}
