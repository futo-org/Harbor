//! Claims whose owner asked `target_identity` for verification — the
//! identity's inbox of verification requests.

use std::collections::HashSet;

use tonic::Status;

use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::proto::{
    ListTargetedVerificationClaimsRequest,
    ListTargetedVerificationClaimsResponse,
};
use crate::service::verifications::repository::Query as Repository;

use super::build_claim_bundles;
use crate::service::events::tombstone::{drop_tombstoned, tombstoned_keys};

pub async fn handle(
    ctx: &ServiceContext,
    req: ListTargetedVerificationClaimsRequest,
) -> Result<ListTargetedVerificationClaimsResponse, Status> {
    if req.target_identity.is_empty() {
        return Err(Status::invalid_argument("target_identity is required"));
    }

    let targets =
        Repository::list_targets_for_identity(&ctx.db, &req.target_identity)
            .await
            .map_err(|e| {
                eprintln!("list_targeted_verification_claims db error: {e}");
                Status::internal("internal server error")
            })?;

    // Deleting a target event revokes the request.
    let target_keys: Vec<TargetEventKey> =
        targets.iter().map(|t| t.target_key.clone()).collect();
    let revoked = tombstoned_keys(ctx, &target_keys).await?;

    let mut seen: HashSet<TargetEventKey> = HashSet::new();
    let claim_keys: Vec<TargetEventKey> = targets
        .into_iter()
        .filter(|t| !revoked.contains(&t.target_key))
        .map(|t| t.claim_key)
        .filter(|key| seen.insert(key.clone()))
        .collect();

    let claim_rows =
        Repository::list_claim_events_by_keys(&ctx.db, &claim_keys)
            .await
            .map_err(|e| {
                eprintln!("list_targeted_verification_claims db error: {e}");
                Status::internal("internal server error")
            })?;
    let claim_rows = drop_tombstoned(ctx, claim_rows).await?;

    let claim_bundles = build_claim_bundles(ctx, claim_rows).await?;
    Ok(ListTargetedVerificationClaimsResponse { claim_bundles })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::verifications::rpc::tests::{
        claim_row, ctx, no_rows, target_row, target_table_row,
    };
    use sea_orm::{DbBackend, MockDatabase};

    #[tokio::test]
    async fn returns_claims_targeting_the_identity() {
        let db = MockDatabase::new(DbBackend::Postgres)
            // Requests naming "bob", their tombstones, the claims they
            // reference, the claims' tombstones, then the claims' targets
            // (+ tombstones) and verifies for the status wrapping.
            .append_query_results([vec![target_table_row(2, "alice", "bob")]])
            .append_query_results([no_rows()])
            .append_query_results([vec![claim_row(1, "alice")]])
            .append_query_results([no_rows()])
            .append_query_results([vec![target_row(2, "alice", &["bob"])]])
            .append_query_results([no_rows()])
            .append_query_results([no_rows()])
            .into_connection();
        let ctx = ctx(db).await;

        let response = handle(
            &ctx,
            ListTargetedVerificationClaimsRequest {
                target_identity: "bob".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(response.claim_bundles.len(), 1);
        let bundle = &response.claim_bundles[0];
        assert_eq!(
            bundle
                .claim
                .as_ref()
                .unwrap()
                .signed_event
                .as_ref()
                .unwrap()
                .event_bytes,
            vec![1]
        );
        assert_eq!(bundle.targets.len(), 1);
        assert!(bundle.verifies.is_empty());
    }

    #[tokio::test]
    async fn dedupes_repeated_requests_for_the_same_claim() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![
                target_table_row(3, "alice", "bob"),
                target_table_row(2, "alice", "bob"),
            ]])
            .append_query_results([no_rows()])
            .append_query_results([vec![claim_row(1, "alice")]])
            .append_query_results([no_rows()])
            .append_query_results([vec![
                target_row(3, "alice", &["bob"]),
                target_row(2, "alice", &["bob"]),
            ]])
            .append_query_results([no_rows()])
            .append_query_results([no_rows()])
            .into_connection();
        let ctx = ctx(db).await;

        let response = handle(
            &ctx,
            ListTargetedVerificationClaimsRequest {
                target_identity: "bob".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(response.claim_bundles.len(), 1);
        assert_eq!(response.claim_bundles[0].targets.len(), 2);
    }

    #[tokio::test]
    async fn returns_nothing_when_no_requests_exist() {
        // Only the requests query runs: no target keys means no tombstone
        // lookup, and no claim keys means no claims query.
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([Vec::<(
                ::entity::event_model::Model,
                ::entity::content_verification_target_model::Model,
            )>::new()])
            .into_connection();
        let ctx = ctx(db).await;

        let response = handle(
            &ctx,
            ListTargetedVerificationClaimsRequest {
                target_identity: "bob".to_string(),
            },
        )
        .await
        .unwrap();

        assert!(response.claim_bundles.is_empty());
    }

    #[tokio::test]
    async fn rejects_an_empty_identity() {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let ctx = ctx(db).await;

        let result = handle(
            &ctx,
            ListTargetedVerificationClaimsRequest {
                target_identity: String::new(),
            },
        )
        .await;
        assert_eq!(result.unwrap_err().code(), tonic::Code::InvalidArgument);
    }
}
