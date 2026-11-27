//! The VerificationClaim events of an identity at a sequence, for opening a
//! single claim. Targets and verifies are not included.

use tonic::Status;

use crate::data::pipeline;
use crate::service::context::PublicContext;
use crate::service::proto::{
    GetVerificationClaimRequest, GetVerificationClaimResponse,
};
use crate::service::verifications::repository::Query as Repository;

use super::common::claim_bundles::{self, FetchedClaims};
use super::common::map_db_err;

struct Params {
    identity: String,
    sequence: u64,
}

pub async fn handle(
    mut ctx: PublicContext,
    req: GetVerificationClaimRequest,
) -> Result<GetVerificationClaimResponse, Status> {
    let params = Params {
        identity: req.identity,
        sequence: req.sequence,
    };
    let view = pipeline::create_pipeline(
        &mut ctx,
        &params,
        fetch,
        claim_bundles::hydrate,
        claim_bundles::filter,
        claim_bundles::view,
    )
    .await?;
    Ok(GetVerificationClaimResponse {
        candidates: view
            .claim_bundles
            .into_iter()
            .filter_map(|bundle| bundle.claim)
            .collect(),
        event_hints: view.event_hints,
    })
}

async fn fetch(
    ctx: &mut PublicContext,
    params: &Params,
) -> Result<FetchedClaims, Status> {
    let claims = Repository::list_claim_events_at_sequence(
        &mut ctx.db,
        &params.identity,
        params.sequence,
    )
    .await
    .map_err(map_db_err)?;
    Ok(FetchedClaims {
        claims,
        targets: Vec::new(),
        verifies: Vec::new(),
    })
}
