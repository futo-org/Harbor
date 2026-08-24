use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    ContentDigest, ContentDigestType, EventBundle, EventHint,
    ListTargetedVerificationClaimsRequest, ListTargetedVerificationClaimsResponse,
    ListVerificationClaimsRequest, ListVerificationClaimsResponse, ListVerificationTargetsRequest,
    ListVerificationTargetsResponse, ListVerificationVerifiesRequest,
    ListVerificationVerifiesResponse, ResolveVerifiedClaimsRequest, ResolveVerifiedClaimsResponse,
    VerificationClaimBundle, verifications_service_client::VerificationsServiceClient,
};
use prost::Message;

use crate::query::event::key::EventKey;
use crate::query::event::merge::{
    EventBundleResponse, EventDedupKey, event_dedup_key, merge_bundle, merge_bundle_responses,
    merge_event_bundles, merge_event_hints,
};
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListVerificationClaimsArgs {
    pub claimed_by_identity: String,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListVerificationTargetsArgs {
    pub claim_event_key: EventKey,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListVerificationVerifiesArgs {
    pub claim_event_key: EventKey,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListTargetedVerificationClaimsArgs {
    pub target_identity: String,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ResolveVerifiedClaimsArgs {
    /// Optional schema content-digest (sha256) bytes; scopes the search to
    /// that schema. None = any schema.
    pub schema_digest: Option<Vec<u8>>,
    /// Field key/value pairs (STRING) a claim must contain.
    pub fields: HashMap<String, String>,
    /// Trust-root identities; only claims verified by one of these are
    /// returned.
    pub verified_by_identities: Vec<String>,
}

impl EventBundleResponse for ListVerificationTargetsResponse {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle> {
        &mut self.event_bundles
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

impl EventBundleResponse for ListVerificationVerifiesResponse {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle> {
        &mut self.event_bundles
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

/// Responses carrying `claim_bundles` (a claim with its targets/verifies).
trait ClaimBundleResponse: Message + Default {
    fn claim_bundles_mut(&mut self) -> &mut Vec<VerificationClaimBundle>;
    fn hints_mut(&mut self) -> &mut Vec<EventHint>;
}

impl ClaimBundleResponse for ListVerificationClaimsResponse {
    fn claim_bundles_mut(&mut self) -> &mut Vec<VerificationClaimBundle> {
        &mut self.claim_bundles
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

impl ClaimBundleResponse for ListTargetedVerificationClaimsResponse {
    fn claim_bundles_mut(&mut self) -> &mut Vec<VerificationClaimBundle> {
        &mut self.claim_bundles
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

impl ClaimBundleResponse for ResolveVerifiedClaimsResponse {
    fn claim_bundles_mut(&mut self) -> &mut Vec<VerificationClaimBundle> {
        &mut self.claim_bundles
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

/// Merge per-server claim bundles by claim key, combining each claim's
/// targets and verifies; dedupe and drop invalid bundles throughout.
fn merge_claim_bundle_responses<T: ClaimBundleResponse>(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let mut merged: Vec<VerificationClaimBundle> = Vec::new();
    let mut hints: Vec<EventHint> = Vec::new();
    let mut index_by_claim: HashMap<EventDedupKey, usize> = HashMap::new();
    for v in values {
        let Ok(mut incoming) = T::decode(v.as_slice()) else {
            continue;
        };
        hints.append(incoming.hints_mut());
        for group in incoming.claim_bundles_mut().drain(..) {
            let Some(key) = group.claim.as_ref().and_then(event_dedup_key) else {
                continue;
            };
            match index_by_claim.entry(key) {
                Entry::Occupied(entry) => {
                    let existing = &mut merged[*entry.get()];

                    existing.claim = match (existing.claim.take(), group.claim) {
                        (Some(a), Some(b)) => Some(merge_bundle(a, b)),
                        (a, b) => a.or(b),
                    };

                    existing.targets.extend(group.targets);
                    existing.verifies.extend(group.verifies);
                }
                Entry::Vacant(entry) => {
                    entry.insert(merged.len());
                    merged.push(group);
                }
            }
        }
    }

    merge_event_hints(&mut hints);

    {
        let c = client.lock().unwrap();
        retain_validated_hints(&c, &mut hints);
        merged.retain_mut(|group| {
            let mut claim = Vec::from_iter(group.claim.take());
            retain_validated_bundles(&c, &mut claim);
            let Some(valid_claim) = claim.pop() else {
                return false;
            };
            group.claim = Some(valid_claim);
            merge_event_bundles(&mut group.targets);
            retain_validated_bundles(&c, &mut group.targets);
            merge_event_bundles(&mut group.verifies);
            retain_validated_bundles(&c, &mut group.verifies);
            true
        });
    }

    let mut response = T::default();
    *response.claim_bundles_mut() = merged;
    *response.hints_mut() = hints;
    response.encode_to_vec()
}

/// Every bundle in a claim-bundle response, for the local event store.
fn all_bundles(claim_bundles: &[VerificationClaimBundle]) -> Vec<EventBundle> {
    let mut out = Vec::new();
    for group in claim_bundles {
        if let Some(claim) = &group.claim {
            out.push(claim.clone());
        }
        out.extend(group.targets.iter().cloned());
        out.extend(group.verifies.iter().cloned());
    }
    out
}

/// List an identity's verification claims across servers. Emits serialized
/// `ListVerificationClaimsResponse` bytes.
pub fn list_verification_claims(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListVerificationClaimsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = ListVerificationClaimsRequest {
        claimed_by_identity: args.claimed_by_identity,
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = VerificationsServiceClient::new(channel(&server_url).await?)
                .list_verification_claims(request)
                .await
                .map_err(|e| format!("list_verification_claims [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(all_bundles(&response.claim_bundles));
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_claim_bundle_responses::<ListVerificationClaimsResponse>,
        opts,
    ))
}

/// List a claim's VerificationTarget events across servers — who has been
/// asked to verify it. Emits serialized `ListVerificationTargetsResponse`
/// bytes.
pub fn list_verification_targets(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListVerificationTargetsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = ListVerificationTargetsRequest {
        claim_event_key: Some(args.claim_event_key.into()),
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = VerificationsServiceClient::new(channel(&server_url).await?)
                .list_verification_targets(request)
                .await
                .map_err(|e| format!("list_verification_targets [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_bundle_responses::<ListVerificationTargetsResponse>,
        opts,
    ))
}

/// List a claim's VerificationVerify events across servers — who has
/// verified it. Emits serialized `ListVerificationVerifiesResponse` bytes.
pub fn list_verification_verifies(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListVerificationVerifiesArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = ListVerificationVerifiesRequest {
        claim_event_key: Some(args.claim_event_key.into()),
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = VerificationsServiceClient::new(channel(&server_url).await?)
                .list_verification_verifies(request)
                .await
                .map_err(|e| format!("list_verification_verifies [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_bundle_responses::<ListVerificationVerifiesResponse>,
        opts,
    ))
}

/// List the claims whose owners asked `target_identity` for verification —
/// the identity's inbox of verification requests. Emits serialized
/// `ListTargetedVerificationClaimsResponse` bytes.
pub fn list_targeted_verification_claims(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListTargetedVerificationClaimsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = ListTargetedVerificationClaimsRequest {
        target_identity: args.target_identity,
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = VerificationsServiceClient::new(channel(&server_url).await?)
                .list_targeted_verification_claims(request)
                .await
                .map_err(|e| format!("list_targeted_verification_claims [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(all_bundles(&response.claim_bundles));
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_claim_bundle_responses::<ListTargetedVerificationClaimsResponse>,
        opts,
    ))
}

/// Reverse lookup: claims matching a schema + field values that are verified
/// by a trusted identity, each with its targets and verifies. Emits
/// serialized `ResolveVerifiedClaimsResponse` bytes.
pub fn resolve_verified_claims(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ResolveVerifiedClaimsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = ResolveVerifiedClaimsRequest {
        schema_digest: args.schema_digest.map(|value| ContentDigest {
            r#type: ContentDigestType::Sha256 as i32,
            value,
        }),
        fields: args.fields,
        verified_by_identities: args.verified_by_identities,
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = VerificationsServiceClient::new(channel(&server_url).await?)
                .resolve_verified_claims(request)
                .await
                .map_err(|e| format!("resolve_verified_claims [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(all_bundles(&response.claim_bundles));
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_claim_bundle_responses::<ResolveVerifiedClaimsResponse>,
        opts,
    ))
}
