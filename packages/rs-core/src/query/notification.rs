//! Notification-service RPC surfaced as an observable via `Query`.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    EventBundle, ListNotificationsRequest, ListNotificationsResponse, Notification,
    notification_service_client::NotificationServiceClient,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::lock::LockRecover;
use crate::query::event::merge::{EventDedupKey, event_dedup_key, merge_event_hints};
use crate::query::validation::retain_validated_hints;
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListNotificationsArgs {
    pub identity: String,
    /// Return at most this many notifications.
    pub first: Option<u32>,
    /// Return notifications after this cursor.
    pub after: Option<String>,
    /// Label values for which the requester does not want to see content.
    pub omit_labels: Vec<String>,
}

/// Identity of a notification for dedup: the `(trigger, target)` event
/// keys. `None` for a side whose bundle is absent or unparseable.
type NotificationDedupKey = (Option<EventDedupKey>, Option<EventDedupKey>);

fn notification_dedup_key(n: &Notification) -> NotificationDedupKey {
    (
        n.trigger_event.as_ref().and_then(event_dedup_key),
        n.target_event.as_ref().and_then(event_dedup_key),
    )
}

/// Drop notifications whose event bundles don't validate. A notification
/// needs a valid `trigger_event`; a `target_event`, when present, must
/// validate too.
fn retain_validated_notifications(
    client: &PolycentricClient,
    notifications: &mut Vec<Notification>,
) {
    let bundle_ok = |b: &EventBundle| {
        b.signed_event
            .as_ref()
            .is_some_and(|se| client.validate_event(se, &b.event_proofs).is_ok())
    };
    notifications.retain(|n| {
        let trigger_ok = n.trigger_event.as_ref().is_some_and(bundle_ok);
        let target_ok = n.target_event.as_ref().map(bundle_ok).unwrap_or(true);
        trigger_ok && target_ok
    });
}

/// Merge per-server `ListNotificationsResponse`s: concatenate the
/// `notifications` and `event_hints` lists, dedupe each, drop anything that
/// fails validation, and keep the latest non-empty `page_info`.
fn merge_notification_responses(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = ListNotificationsResponse::default();
    for v in values {
        if let Ok(incoming) = ListNotificationsResponse::decode(v.as_slice()) {
            merged.notifications.extend(incoming.notifications);
            merged.event_hints.extend(incoming.event_hints);
            if incoming.page_info.is_some() {
                merged.page_info = incoming.page_info;
            }
        }
    }

    let mut seen: HashSet<NotificationDedupKey> = HashSet::new();
    merged
        .notifications
        .retain(|n| seen.insert(notification_dedup_key(n)));

    merge_event_hints(&mut merged.event_hints);

    {
        let c = client.lock_recover();
        retain_validated_notifications(&c, &mut merged.notifications);
        retain_validated_hints(&c, &mut merged.event_hints);
    }

    merged.encode_to_vec()
}

/// List notifications for `identity`. Fans out to every configured server
/// and emits the merged `ListNotificationsResponse` progressively; every
/// event bundle carried by a response (notification trigger/target events
/// plus hints) is persisted to the local store so the client can resolve
/// them without extra network calls.
pub fn list_notifications(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListNotificationsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListNotificationsArgs {
        identity,
        first,
        after,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let after = after.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();
        async move {
            let response = NotificationServiceClient::new(channel(&server_url).await?)
                .list_notifications(ListNotificationsRequest {
                    identity,
                    first,
                    after,
                    omit_labels,
                })
                .await
                .map_err(|e| format!("list_notifications [{server_url}]: {e}"))?
                .into_inner();

            let bytes = response.encode_to_vec();

            // Persist every bundle the response carried.
            let mut bundles: Vec<EventBundle> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            for n in response.notifications {
                bundles.extend(n.trigger_event);
                bundles.extend(n.target_event);
            }
            if !bundles.is_empty() {
                client.lock_recover().copy_bundles(bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_notification_responses, opts))
}
