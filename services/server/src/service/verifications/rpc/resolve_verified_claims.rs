//! Reverse lookup: claims whose fields match given values and that a trusted
//! identity has verified, optionally scoped to a schema by digest. Returns
//! each matching claim with its targets and verifies.
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::HasEventKey;
use crate::service::proto::{
    ResolveVerifiedClaimsRequest, ResolveVerifiedClaimsResponse,
};
use crate::service::verifications::repository::Query as Repository;
use std::collections::HashSet;
use tonic::Status;

use super::common::claim_bundles::{self, FetchedClaims};
use super::common::map_db_err;

struct Params {
    schema_digest: Option<(i32, Vec<u8>)>,
    match_fields: serde_json::Value,
    verified_by: HashSet<String>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: ResolveVerifiedClaimsRequest,
) -> Result<ResolveVerifiedClaimsResponse, Status> {
    if req.verified_by_identities.is_empty() {
        return Err(Status::invalid_argument(
            "verified_by_identities is required",
        ));
    }
    // An empty match with no scope would return every verified claim; require
    // at least one narrowing dimension.
    let schema_digest = req
        .schema_digest
        .filter(|digest| !digest.value.is_empty())
        .map(|digest| (digest.r#type, digest.value));
    if schema_digest.is_none() && req.fields.is_empty() {
        return Err(Status::invalid_argument(
            "schema_digest or fields is required",
        ));
    }

    // Fields are STRING (the only kind in use), matched by JSONB containment.
    let match_fields = serde_json::Value::Object(
        req.fields
            .into_iter()
            .map(|(key, value)| (key, serde_json::Value::String(value)))
            .collect(),
    );

    let params = Params {
        schema_digest,
        match_fields,
        verified_by: req.verified_by_identities.into_iter().collect(),
    };
    let view = pipeline::create_pipeline(
        ctx,
        &params,
        fetch,
        claim_bundles::hydrate,
        claim_bundles::filter,
        claim_bundles::view,
    )
    .await?;
    Ok(ResolveVerifiedClaimsResponse {
        claim_bundles: view.claim_bundles,
        event_hints: view.event_hints,
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<FetchedClaims, Status> {
    let claims = Repository::list_claim_events_by_fields(
        &ctx.db,
        params.schema_digest.clone(),
        params.match_fields.clone(),
    )
    .await
    .map_err(map_db_err)?;
    let mut fetched =
        claim_bundles::fetch_verification_state(ctx, claims).await?;

    // A claim counts as verified only if one of its verifies was authored by
    // a trusted identity (the verify event's own author). Keep those claims,
    // then drop verification state left orphaned by the filter.
    let trusted_claim_keys: HashSet<TargetEventKey> = fetched
        .verifies
        .iter()
        .filter(|verify| params.verified_by.contains(&verify.event.identity))
        .map(|verify| verify.claim_key.clone())
        .collect();
    fetched
        .claims
        .retain(|claim| trusted_claim_keys.contains(&claim.event_key()));
    let live: HashSet<TargetEventKey> =
        fetched.claims.iter().map(HasEventKey::event_key).collect();
    fetched.targets.retain(|t| live.contains(&t.claim_key));
    fetched.verifies.retain(|v| live.contains(&v.claim_key));
    Ok(fetched)
}
