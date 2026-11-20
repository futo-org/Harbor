//! `set_device_push_subscriptions`: replace the push subscriptions of a push
//! target and of every signer in the request.

use crate::context::Context;
use crate::manager::PushService;
use polycentric_common::jwt::verify_jwt;
use polycentric_common::models::protos_v2::{
    AuthenticatedPushSource, PublicKey, SetDevicePushSubscriptionsRequest,
    SetDevicePushSubscriptionsResponse,
};
use std::collections::HashSet;
use tonic::Status;

/// Upper bound on the number of subscriptions that we allow for a push target.
pub const MAX_SUBSCRIPTIONS: usize = 100;

pub async fn handle(
    ctx: &Context,
    request: SetDevicePushSubscriptionsRequest,
) -> Result<SetDevicePushSubscriptionsResponse, Status> {
    // Extract input data from the request and doing basic checks
    let SetDevicePushSubscriptionsRequest {
        push_target,
        subscriptions,
    } = request;

    let target = push_target.ok_or_else(|| Status::invalid_argument("missing push_target"))?;

    if subscriptions.len() > MAX_SUBSCRIPTIONS {
        return Err(Status::invalid_argument(format!(
            "too many subscriptions: {} > {MAX_SUBSCRIPTIONS}",
            subscriptions.len()
        )));
    }

    if target.service != PushService::Expo.as_ref() {
        return Err(Status::invalid_argument(format!(
            "unsupported push service: {}",
            target.service
        )));
    }

    // Ensure that all of the subscriptions are valid
    let now = now_secs();
    let subscriptions = subscriptions
        .iter()
        .enumerate()
        .map(|(index, source)| authenticate_source(index, source, &ctx.allow_hosts, now))
        .collect::<Result<Vec<_>, Status>>()?;

    // Detect duplicates in subscriptions
    let mut seen = HashSet::new();
    if let Some(index) = subscriptions
        .iter()
        .position(|(signer, identity)| !seen.insert((signer, identity)))
    {
        return Err(Status::invalid_argument(format!(
            "subscription {index}: duplicate (signer, identity)"
        )));
    }

    // Do registration
    ctx.notification_manager
        .register(&ctx.db, &target, &subscriptions)
        .await
        .map_err(|err| Status::unknown(err.to_string()))?;

    Ok(SetDevicePushSubscriptionsResponse {})
}

/// Verify a subscription's JWT and return its `(signer, identity)`.
/// `index` is just for the error message.
fn authenticate_source(
    index: usize,
    source: &AuthenticatedPushSource,
    allowed_audiences: &[String],
    now: u64,
) -> Result<(PublicKey, String), Status> {
    // Error mapper
    let unauthenticated = |err| Status::unauthenticated(format!("subscription {index}: {err}"));

    // Check the signature and decode the token.
    let verified = verify_jwt(&source.jwt).map_err(unauthenticated)?;

    // Ensure the token is valid in this context
    verified
        .validate(allowed_audiences, now)
        .map_err(unauthenticated)?;

    Ok((verified.signed_by, verified.claims.iss))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
