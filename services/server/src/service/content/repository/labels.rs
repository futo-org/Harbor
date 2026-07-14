use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Labels;
use ::entity::content_label_model as ContentLabelModel;
use sea_orm::{ActiveValue::Set, ConnectionTrait, EntityTrait};
use tonic::Status;

/// Persists content labels from a `ContentBody::Labels` event into the
/// `content_label` table.
pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    labels: Labels,
) -> Result<(), Status> {
    let key = split_event_key(labels.event_key, "labels content")?;

    // One row per label value for efficient aggregation; the labeled
    // event's key is denormalized onto each row.
    let rows: Vec<ContentLabelModel::ActiveModel> = labels
        .label_values
        .into_iter()
        .map(|label_value| ContentLabelModel::ActiveModel {
            content_id: Set(ctx.content_id),
            label_value: Set(label_value),
            event_key_collection: Set(key.collection),
            event_key_identity: Set(key.identity.clone()),
            event_key_public_key_type: Set(key.public_key_type),
            event_key_public_key: Set(key.public_key.clone()),
            event_key_sequence: Set(key.sequence),
        })
        .collect();

    if !rows.is_empty() {
        ContentLabelModel::Entity::insert_many(rows)
            .exec(db)
            .await
            .map_err(map_db_err)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::{EventKey, PublicKey};
    use sea_orm::{DatabaseBackend, MockDatabase, Value};
    use std::collections::BTreeMap;
    use tonic::Code;

    fn event_key() -> EventKey {
        EventKey {
            collection: 8,
            identity: "alice".to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![0xAB, 0xCD],
            }),
            sequence: 7,
        }
    }

    fn make_labels() -> Labels {
        Labels {
            event_key: Some(event_key()),
            label_values: vec!["spam".into()],
        }
    }

    fn ctx_moderator() -> ChildContext<'static> {
        ChildContext {
            content_id: 1,
            event_identity: "mod",
        }
    }

    fn sample_content_label_row(label_value: &str) -> BTreeMap<String, Value> {
        BTreeMap::from([
            ("content_id".into(), Value::BigInt(Some(1))),
            (
                "label_value".into(),
                Value::String(Some(label_value.into())),
            ),
            ("event_key_collection".into(), Value::SmallInt(Some(8))),
            (
                "event_key_identity".into(),
                Value::String(Some("alice".into())),
            ),
            ("event_key_public_key_type".into(), Value::SmallInt(Some(1))),
            (
                "event_key_public_key".into(),
                Value::Bytes(Some(vec![0xAB, 0xCD])),
            ),
            ("event_key_sequence".into(), Value::BigInt(Some(7))),
        ])
    }

    #[tokio::test]
    async fn trusted_moderator_persists_labels() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![sample_content_label_row("spam")]])
            .into_connection();
        let ctx = ctx_moderator();
        let labels = make_labels();

        add(&db, &ctx, labels).await.unwrap();

        let log = format!("{:?}", db.into_transaction_log());
        assert!(log.contains("INSERT"), "expected INSERT in log: {log}");
        assert!(
            log.contains("content_label"),
            "expected content_label table: {log}"
        );
        assert!(log.contains("spam"), "expected label value in SQL: {log}");
    }

    #[tokio::test]
    async fn empty_label_values_noop() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let ctx = ctx_moderator();
        let labels = Labels {
            event_key: Some(event_key()),
            label_values: vec![],
        };

        add(&db, &ctx, labels).await.unwrap();

        assert!(
            db.into_transaction_log().is_empty(),
            "no DB calls expected when label_values is empty"
        );
    }

    #[tokio::test]
    async fn missing_event_key_errors() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let ctx = ctx_moderator();
        let labels = Labels {
            event_key: None,
            label_values: vec!["spam".into()],
        };

        let err = add(&db, &ctx, labels).await.unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("missing event_key"));
        assert!(
            db.into_transaction_log().is_empty(),
            "no DB calls after validation error"
        );
    }

    #[tokio::test]
    async fn missing_signed_by_errors() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let ctx = ctx_moderator();
        let mut key = event_key();
        key.signed_by = None;
        let labels = Labels {
            event_key: Some(key),
            label_values: vec!["spam".into()],
        };

        let err = add(&db, &ctx, labels).await.unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("missing signed_by"));
        assert!(
            db.into_transaction_log().is_empty(),
            "no DB calls after validation error"
        );
    }

    #[tokio::test]
    async fn multiple_label_values_one_row_each() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![
                sample_content_label_row("spam"),
                sample_content_label_row("hate"),
            ]])
            .into_connection();
        let ctx = ctx_moderator();
        let labels = Labels {
            event_key: Some(event_key()),
            label_values: vec!["spam".into(), "hate".into()],
        };

        add(&db, &ctx, labels).await.unwrap();

        let log = format!("{:?}", db.into_transaction_log());
        assert!(log.contains("INSERT"), "expected INSERT in log: {log}");
        assert!(
            log.contains("content_label"),
            "expected content_label table: {log}"
        );
        assert!(
            log.matches("spam").count() >= 1,
            "expected 'spam' in INSERT SQL: {log}"
        );
        assert!(
            log.matches("hate").count() >= 1,
            "expected 'hate' in INSERT SQL: {log}"
        );
    }
}
