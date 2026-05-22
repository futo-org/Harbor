//! Shared validation passes for per-RPC merge functions. Each merge
//! function combines per-server responses and then runs these to drop
//! any bundles/hints that don't pass `PolycentricClient::validate_event`.

use polycentric_common::models::protos_v2::{EventBundle, EventHint};

use crate::client::PolycentricClient;

/// Retain only bundles whose signed event passes `validate_event`.
pub(crate) fn retain_validated_bundles(client: &PolycentricClient, bundles: &mut Vec<EventBundle>) {
    bundles.retain(|b| match b.signed_event.as_ref() {
        Some(se) => match client.validate_event(se, &b.event_proofs) {
            Ok(()) => true,
            Err(e) => {
                crate::logging::log_msg(format!("[merge] dropping bundle: {e:?}"));
                false
            }
        },
        None => false,
    });
}

/// Retain only hints whose signed event passes `validate_event`.
pub(crate) fn retain_validated_hints(client: &PolycentricClient, hints: &mut Vec<EventHint>) {
    hints.retain(|h| match h.event_bundle.as_ref() {
        Some(b) => match b.signed_event.as_ref() {
            Some(se) => match client.validate_event(se, &b.event_proofs) {
                Ok(()) => true,
                Err(e) => {
                    crate::logging::log_msg(format!("[merge] dropping hint: {e:?}"));
                    false
                }
            },
            None => false,
        },
        None => false,
    });
}
