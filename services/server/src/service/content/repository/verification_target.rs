use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::VerificationTarget;
use ::entity::content_verification_target_model as ContentVerificationTargetModel;
use sea_orm::{ActiveValue::Set, ConnectionTrait, EntityTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    target: VerificationTarget,
) -> Result<(), Status> {
    let key = split_event_key(target.claim_event_key, "verification target")?;

    // One row per target identity, all referencing the claim.
    let rows: Vec<ContentVerificationTargetModel::ActiveModel> = target
        .target_identities
        .into_iter()
        .map(
            |target_identity| ContentVerificationTargetModel::ActiveModel {
                content_id: Set(ctx.content_id),
                target_identity: Set(target_identity),
                claim_event_key_collection: Set(key.collection),
                claim_event_key_identity: Set(key.identity.clone()),
                claim_event_key_public_key_type: Set(key.public_key_type),
                claim_event_key_public_key: Set(key.public_key.clone()),
                claim_event_key_sequence: Set(key.sequence),
            },
        )
        .collect();

    if !rows.is_empty() {
        ContentVerificationTargetModel::Entity::insert_many(rows)
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

    fn claim_key() -> EventKey {
        EventKey {
            collection: 8,
            identity: "bob".to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![0xAB],
            }),
            sequence: 3,
        }
    }

    fn returned_row(
        target_identity: &str,
    ) -> ContentVerificationTargetModel::Model {
        ContentVerificationTargetModel::Model {
            content_id: 5,
            target_identity: target_identity.to_string(),
            claim_event_key_collection: 8,
            claim_event_key_identity: "bob".to_string(),
            claim_event_key_public_key_type: 1,
            claim_event_key_public_key: vec![0xAB],
            claim_event_key_sequence: 3,
        }
    }

    #[tokio::test]
    async fn inserts_one_row_per_target_identity() {
        // insert_many on Postgres uses INSERT ... RETURNING, so the mock
        // must hand back the inserted rows.
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![returned_row("x"), returned_row("y")]])
            .into_connection();

        let target = VerificationTarget {
            claim_event_key: Some(claim_key()),
            target_identities: vec!["x".to_string(), "y".to_string()],
        };
        add(
            &db,
            &ChildContext {
                content_id: 5,
                event_identity: "alice",
            },
            target,
        )
        .await
        .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("content_verification_target"), "{sql}");
        assert!(sql.contains("claim_event_key_identity"), "{sql}");
        assert!(sql.contains("target_identity"), "{sql}");
    }

    #[tokio::test]
    async fn empty_targets_is_noop() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let target = VerificationTarget {
            claim_event_key: Some(claim_key()),
            target_identities: vec![],
        };
        add(
            &db,
            &ChildContext {
                content_id: 5,
                event_identity: "alice",
            },
            target,
        )
        .await
        .unwrap();
        assert!(db.into_transaction_log().is_empty());
    }

    #[tokio::test]
    async fn missing_claim_key_errors() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let target = VerificationTarget {
            claim_event_key: None,
            target_identities: vec!["x".to_string()],
        };
        let err = add(
            &db,
            &ChildContext {
                content_id: 5,
                event_identity: "alice",
            },
            target,
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(db.into_transaction_log().is_empty());
    }
}
