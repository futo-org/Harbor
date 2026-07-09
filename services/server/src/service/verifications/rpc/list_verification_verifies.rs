//! VerificationVerify events for a claim: who has verified it.

use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::identity::service::rows_to_bundles;
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{
    ListVerificationVerifiesRequest, ListVerificationVerifiesResponse,
};
use crate::service::verifications::repository::{
    Query as Repository, VerificationEventDto,
};
use tonic::Status;

use crate::service::events::tombstone::drop_tombstoned;

pub async fn handle(
    ctx: &ServiceContext,
    req: ListVerificationVerifiesRequest,
) -> Result<ListVerificationVerifiesResponse, Status> {
    let claim_key =
        TargetEventKey::from_request(req.claim_event_key, "claim_event_key")?;

    let rows = Repository::list_verify_events_for_claims(
        &ctx.db,
        std::slice::from_ref(&claim_key),
    )
    .await
    .map_err(|e| {
        eprintln!("list_verification_verifies db error: {e}");
        Status::internal("internal server error")
    })?
    .into_iter()
    .map(VerificationEventDto::into_row)
    .collect();
    let rows = drop_tombstoned(ctx, rows).await?;

    let mut event_bundles = rows_to_bundles(rows);
    attach_proofs(ctx, &mut event_bundles).await?;
    Ok(ListVerificationVerifiesResponse { event_bundles })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::verifications::rpc::tests::{
        claim_event_key, ctx, no_rows, verify_row,
    };
    use sea_orm::{DbBackend, MockDatabase};

    #[tokio::test]
    async fn returns_verify_bundles() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![
                verify_row(2, "bob", "alice"),
                verify_row(1, "carol", "alice"),
            ]])
            .append_query_results([no_rows()])
            .into_connection();
        let ctx = ctx(db).await;

        let response = handle(
            &ctx,
            ListVerificationVerifiesRequest {
                claim_event_key: Some(claim_event_key("alice")),
            },
        )
        .await
        .unwrap();

        assert_eq!(response.event_bundles.len(), 2);
    }

    #[tokio::test]
    async fn rejects_a_missing_claim_key() {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let ctx = ctx(db).await;

        let result = handle(
            &ctx,
            ListVerificationVerifiesRequest {
                claim_event_key: None,
            },
        )
        .await;
        assert_eq!(result.unwrap_err().code(), tonic::Code::InvalidArgument);
    }
}
