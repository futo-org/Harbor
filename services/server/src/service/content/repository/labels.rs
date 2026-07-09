use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Labels;
use ::entity::content_label_model as ContentLabelModel;
use sea_orm::{ActiveValue::Set, ConnectionTrait, EntityTrait};
use tonic::Status;

/// Persists content labels from a `ContentBody::Labels` event into the `content_labels` table.
/// Writes one row per label value. This is a no-op (returns `Ok(())` without writing) unless the
/// event author is the configured trusted moderator.
///
/// Note that label events from non-trusted identities are stored in the `event` and `content`
/// tables via the standard `put_events` pipeline. The `content_labels` table filters for trusted
/// label events for faster querying.
pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    labels: Labels,
) -> Result<(), Status> {
    // Only a trusted moderator can persist labels.
    if ctx.trusted_moderator != Some(ctx.event_identity) {
        return Ok(());
    }

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
    use sea_orm::{DatabaseBackend, MockDatabase};
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
            trusted_moderator: Some("mod"),
        }
    }

    fn sample_label_model(label_value: &str) -> ContentLabelModel::Model {
        ContentLabelModel::Model {
            content_id: 1,
            label_value: label_value.into(),
            event_key_collection: 8,
            event_key_identity: "alice".into(),
            event_key_public_key_type: 1,
            event_key_public_key: vec![0xAB, 0xCD],
            event_key_sequence: 7,
        }
    }

    #[tokio::test]
    async fn trusted_moderator_persists_labels() {
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![sample_label_model("spam")]])
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
    async fn untrusted_moderator_noop() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let ctx = ChildContext {
            content_id: 1,
            event_identity: "other_user",
            trusted_moderator: Some("mod"),
        };
        let labels = make_labels();

        add(&db, &ctx, labels).await.unwrap();

        assert!(
            db.into_transaction_log().is_empty(),
            "no DB calls expected when moderator does not match"
        );
    }

    #[tokio::test]
    async fn no_moderator_configured_noop() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let ctx = ChildContext {
            content_id: 1,
            event_identity: "mod",
            trusted_moderator: None,
        };
        let labels = make_labels();

        add(&db, &ctx, labels).await.unwrap();

        assert!(
            db.into_transaction_log().is_empty(),
            "no DB calls expected when no moderator configured"
        );
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
                sample_label_model("spam"),
                sample_label_model("hate"),
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
            log.matches("spam").count() >= 1,
            "expected 'spam' in INSERT SQL: {log}"
        );
        assert!(
            log.matches("hate").count() >= 1,
            "expected 'hate' in INSERT SQL: {log}"
        );
    }
}
