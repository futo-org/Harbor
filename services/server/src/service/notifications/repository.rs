use ::entity::{
    content_label_model as ContentLabelModel, content_model as ContentModel,
    event_model as EventModel, notification,
};
use sea_orm::{
    sea_query::{Expr, Query as SeaQuery},
    *,
};
pub struct Query;

impl Query {
    /// Notifications addressed to `to_identity`, newest first. Any event
    /// targeted by a label event that matches `omit_labels` is filtered
    /// out.
    pub async fn list_for_identity(
        db: &DbConn,
        to_identity: &str,
        limit: u64,
        after_id: Option<i64>,
        omit_labels: &[String],
        trusted_moderator: Option<&str>,
    ) -> Result<Vec<notification::Model>, DbErr> {
        let mut query = notification::Entity::find()
            .filter(notification::Column::ToIdentity.eq(to_identity))
            .order_by_desc(notification::Column::Id)
            .limit(limit);

        if let Some(after) = after_id {
            query = query.filter(notification::Column::Id.lt(after));
        }

        if !omit_labels.is_empty()
            && let Some(moderator) = trusted_moderator
        {
            // The `trigger` event is activity related to a `target` event.
            // We assume that, in the context of a notification, the `target`
            // event is never objectionable because it is authored by the
            // identity we are serving notifications to, so we only check the
            // `trigger` event.
            query = query.filter(Expr::not_exists(
                omit_trigger_labels_subquery(moderator, omit_labels),
            ));
        }

        query.all(db).await
    }
}

/// Creates a sub-expression to include in a notifications query which finds
/// label events from the trusted moderator targeting a trigger event for a
/// notification, using a join through `content_label` → `content` → `events`
/// to check the label author's identity. Caller must ensure `omit_labels` is
/// not empty.
fn omit_trigger_labels_subquery(
    trusted_moderator: &str,
    omit_labels: &[String],
) -> sea_query::SelectStatement {
    let mut sub = SeaQuery::select();
    sub.expr(Expr::val(1))
        .from(ContentLabelModel::Entity)
        .inner_join(
            ContentModel::Entity,
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::ContentId,
            ))
            .equals((ContentModel::Entity, ContentModel::Column::Id)),
        )
        .inner_join(
            EventModel::Entity,
            Expr::col((
                EventModel::Entity,
                EventModel::Column::ContentDigestType,
            ))
            .equals((ContentModel::Entity, ContentModel::Column::DigestType))
            .and(
                Expr::col((
                    EventModel::Entity,
                    EventModel::Column::ContentDigestBytes,
                ))
                .equals((
                    ContentModel::Entity,
                    ContentModel::Column::DigestBytes,
                )),
            ),
        )
        .and_where(
            Expr::col((EventModel::Entity, EventModel::Column::Identity))
                .eq(trusted_moderator.to_owned()),
        )
        .and_where(
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::EventKeyCollection,
            ))
            .equals((
                notification::Entity,
                notification::Column::TriggerEventKeyCollection,
            )),
        )
        .and_where(
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::EventKeyIdentity,
            ))
            .equals((
                notification::Entity,
                notification::Column::TriggerEventKeyIdentity,
            )),
        )
        .and_where(
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::EventKeyPublicKeyType,
            ))
            .equals((
                notification::Entity,
                notification::Column::TriggerEventKeyPublicKeyType,
            )),
        )
        .and_where(
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::EventKeyPublicKey,
            ))
            .equals((
                notification::Entity,
                notification::Column::TriggerEventKeyPublicKey,
            )),
        )
        .and_where(
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::EventKeySequence,
            ))
            .equals((
                notification::Entity,
                notification::Column::TriggerEventKeySequence,
            )),
        )
        .and_where(
            Expr::col((
                ContentLabelModel::Entity,
                ContentLabelModel::Column::LabelValue,
            ))
            .is_in(omit_labels.iter().cloned()),
        );
    sub
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DatabaseBackend, MockDatabase};

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

        let rows = Query::list_for_identity(&db, "bob", 50, None, &[], None)
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

        Query::list_for_identity(&db, "bob", 25, None, &[], None)
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

        Query::list_for_identity(&db, "bob", 25, Some(100), &[], None)
            .await
            .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains('<'), "cursor adds an id upper-bound: {sql}");
    }

    #[tokio::test]
    async fn omit_labels_empty_no_not_exists() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<notification::Model>::new()])
            .into_connection();

        Query::list_for_identity(&db, "bob", 25, None, &[], None)
            .await
            .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(
            !sql.contains("NOT EXISTS"),
            "empty omit_labels should not add NOT EXISTS: {sql}"
        );
    }

    #[tokio::test]
    async fn omit_labels_single_value_adds_not_exists() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<notification::Model>::new()])
            .into_connection();

        Query::list_for_identity(
            &db,
            "bob",
            25,
            None,
            &["spam".into()],
            Some("trusted_moderator"),
        )
        .await
        .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(
            sql.contains("NOT EXISTS"),
            "single omit_label should add NOT EXISTS: {sql}"
        );
        assert!(
            sql.contains("content_label"),
            "NOT EXISTS should reference content_label table: {sql}"
        );
        assert!(
            sql.contains("trigger_event_key"),
            "NOT EXISTS should join on trigger event key columns: {sql}"
        );
    }

    #[tokio::test]
    async fn omit_labels_multiple_values_in_clause() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([Vec::<notification::Model>::new()])
            .into_connection();

        Query::list_for_identity(
            &db,
            "bob",
            25,
            None,
            &["spam".into(), "hate".into()],
            Some("trusted_moderator"),
        )
        .await
        .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(
            sql.contains("NOT EXISTS"),
            "multiple omit_labels should add NOT EXISTS: {sql}"
        );
        assert!(
            sql.contains("IN (") || sql.contains("IN(") || sql.contains("spam"),
            "multiple omit_labels should produce IN clause: {sql}"
        );
    }
}
