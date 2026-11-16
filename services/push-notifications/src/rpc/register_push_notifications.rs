//! `register_push_notifications`: replace the push subscriptions of a push
//! target and of every signer in the request. Each subscription is the
//! target signed by a key, scoped to one identity. An empty subscription
//! list removes the target's subscriptions (there is no unregister RPC).
//! Mutation — no pipeline.

use crate::context::Context;
use crate::manager::PushService;
use crate::repository::MAX_SUBSCRIPTIONS;
use polycentric_common::error::CoreError;
use polycentric_common::models::protos_v2::{
    PublicKey, PushSubscription, PushTarget, RegisterPushNotificationRequest,
    RegisterPushNotificationResponse,
};
use std::collections::HashSet;
use tonic::Status;

pub async fn handle(
    ctx: &Context,
    request: RegisterPushNotificationRequest,
) -> Result<RegisterPushNotificationResponse, Status> {
    // Extract input data from the request and doing basic checks
    let RegisterPushNotificationRequest {
        subscriptions,
        push_target,
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
    let subscriptions = subscriptions
        .into_iter()
        .enumerate()
        .map(|(index, subscription)| open_subscription(index, subscription, &target))
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

    Ok(RegisterPushNotificationResponse {})
}

/// Validate a subscription's signature and target.
/// `index` is just for the error message.
fn open_subscription(
    index: usize,
    subscription: PushSubscription,
    target: &PushTarget,
) -> Result<(PublicKey, String), Status> {
    let (identity, signer, signed_target) = subscription.open().map_err(|err| match err {
        CoreError::SignatureError(msg) => {
            Status::unauthenticated(format!("subscription {index}: {msg}"))
        }
        other => Status::invalid_argument(format!("subscription {index}: {other}")),
    })?;

    if signed_target != *target {
        return Err(Status::invalid_argument(format!(
            "subscription {index}: signed push target does not match push_target"
        )));
    }

    Ok((signer, identity))
}
