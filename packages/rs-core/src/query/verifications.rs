use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    EventBundle, EventHint, ListTargetedVerificationClaimsRequest,
    ListTargetedVerificationClaimsResponse, ListVerificationClaimsRequest,
    ListVerificationClaimsResponse, ListVerificationTargetsRequest,
    ListVerificationTargetsResponse, ListVerificationVerifiesRequest,
    ListVerificationVerifiesResponse, VerificationClaimBundle,
    verifications_service_client::VerificationsServiceClient,
};
use prost::Message;

use crate::query::event::dedup::{EventDedupKey, event_dedup_key};
use crate::query::event::key::EventKey;
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

/// Responses carrying a flat `event_bundles` list.
trait EventBundleResponse: Message + Default {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle>;
    fn hints_mut(&mut self) -> &mut Vec<EventHint>;
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

fn dedupe_bundles(bundles: &mut Vec<EventBundle>) {
    let mut seen: HashSet<EventDedupKey> = HashSet::new();
    bundles.retain(|bundle| match event_dedup_key(bundle) {
        Some(k) => seen.insert(k),
        None => true,
    });
}

fn dedupe_hints(hints: &mut Vec<EventHint>) {
    let mut seen: HashSet<EventDedupKey> = HashSet::new();
    hints.retain(
        |hint| match hint.event_bundle.as_ref().and_then(event_dedup_key) {
            Some(k) => seen.insert(k),
            None => true,
        },
    );
}

/// Concatenate per-server bundles, dedupe by `EventKey`, drop invalid ones.
fn merge_bundle_responses<T: EventBundleResponse>(
    values: &[Vec<u8>],
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = T::default();
    for v in values {
        if let Ok(mut incoming) = T::decode(v.as_slice()) {
            merged.bundles_mut().append(incoming.bundles_mut());
            merged.hints_mut().append(incoming.hints_mut());
        }
    }

    dedupe_bundles(merged.bundles_mut());
    dedupe_hints(merged.hints_mut());

    let c = client.lock().unwrap();
    retain_validated_bundles(&c, merged.bundles_mut());
    retain_validated_hints(&c, merged.hints_mut());
    drop(c);

    merged.encode_to_vec()
}

/// Merge per-server claim bundles by claim key, combining each claim's
/// targets and verifies; dedupe and drop invalid bundles throughout.
fn merge_claim_bundle_responses<T: ClaimBundleResponse>(
    values: &[Vec<u8>],
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

    dedupe_hints(&mut hints);

    let c = client.lock().unwrap();
    retain_validated_hints(&c, &mut hints);
    merged.retain_mut(|group| {
        let mut claim = Vec::from_iter(group.claim.take());
        retain_validated_bundles(&c, &mut claim);
        let Some(valid_claim) = claim.pop() else {
            return false;
        };
        group.claim = Some(valid_claim);
        dedupe_bundles(&mut group.targets);
        retain_validated_bundles(&c, &mut group.targets);
        dedupe_bundles(&mut group.verifies);
        retain_validated_bundles(&c, &mut group.verifies);
        true
    });
    drop(c);

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
            let response = VerificationsServiceClient::new(channel(&server_url)?)
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
            let response = VerificationsServiceClient::new(channel(&server_url)?)
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
            let response = VerificationsServiceClient::new(channel(&server_url)?)
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
            let response = VerificationsServiceClient::new(channel(&server_url)?)
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
