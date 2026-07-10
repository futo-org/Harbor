use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::VerificationVerify;
use ::entity::content_verification_verify_model as ContentVerificationVerifyModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    verify: VerificationVerify,
) -> Result<(), Status> {
    let key = split_event_key(verify.claim_event_key, "verification verify")?;

    ContentVerificationVerifyModel::ActiveModel {
        content_id: Set(ctx.content_id),
        claim_event_key_collection: Set(key.collection),
        claim_event_key_identity: Set(key.identity),
        claim_event_key_public_key_type: Set(key.public_key_type),
        claim_event_key_public_key: Set(key.public_key),
        claim_event_key_sequence: Set(key.sequence),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::{EventKey, PublicKey};
    use sea_orm::{DatabaseBackend, MockDatabase};
    use tonic::Code;

    #[tokio::test]
    async fn inserts_denormalized_claim_key() {
        let returned = ContentVerificationVerifyModel::Model {
            content_id: 9,
            claim_event_key_collection: 8,
            claim_event_key_identity: "bob".to_string(),
            claim_event_key_public_key_type: 1,
            claim_event_key_public_key: vec![0xAB],
            claim_event_key_sequence: 4,
        };
        let db = MockDatabase::new(DatabaseBackend::Postgres)
            .append_query_results([vec![returned]])
            .into_connection();

        let verify = VerificationVerify {
            claim_event_key: Some(EventKey {
                collection: 8,
                identity: "bob".to_string(),
                signed_by: Some(PublicKey {
                    key_type: 1,
                    key: vec![0xAB],
                }),
                sequence: 4,
            }),
        };
        add(
            &db,
            &ChildContext {
                content_id: 9,
                event_identity: "alice",
            },
            verify,
        )
        .await
        .unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("content_verification_verify"), "{sql}");
        assert!(sql.contains("claim_event_key_sequence"), "{sql}");
    }

    #[tokio::test]
    async fn missing_claim_key_errors() {
        let db = MockDatabase::new(DatabaseBackend::Postgres).into_connection();
        let err = add(
            &db,
            &ChildContext {
                content_id: 9,
                event_identity: "alice",
            },
            VerificationVerify {
                claim_event_key: None,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(db.into_transaction_log().is_empty());
    }
}
