//! Shared validation passes for per-RPC merge functions. Each merge
//! function combines per-server responses and then runs these to drop
//! any bundles/hints that don't pass `PolycentricClient::validate_event`.
//!
//! Dropping is expected and routine — e.g. an identity whose chain can't be
//! fully reconstructed (a deleted or not-yet-synced identity event leaves a
//! gap) makes every later event fail validation. To avoid flooding the log
//! (and freezing the UI) we emit at most one aggregated line per pass rather
//! than one per dropped item.

use polycentric_common::models::protos_v2::{EventBundle, EventHint};

use crate::client::PolycentricClient;

/// Retain only bundles whose signed event passes `validate_event`.
pub(crate) fn retain_validated_bundles(client: &PolycentricClient, bundles: &mut Vec<EventBundle>) {
    let before = bundles.len();
    let mut first_error: Option<String> = None;
    bundles.retain(|b| match b.signed_event.as_ref() {
        Some(se) => match client.validate_event(se, &b.event_proofs) {
            Ok(()) => true,
            Err(e) => {
                first_error.get_or_insert_with(|| format!("{e:?}"));
                false
            }
        },
        None => false,
    });
    log_dropped("bundle", before - bundles.len(), first_error);
}

/// Retain only hints whose signed event passes `validate_event`.
pub(crate) fn retain_validated_hints(client: &PolycentricClient, hints: &mut Vec<EventHint>) {
    let before = hints.len();
    let mut first_error: Option<String> = None;
    hints.retain(|h| {
        match h
            .event_bundle
            .as_ref()
            .and_then(|b| b.signed_event.as_ref().map(|se| (b, se)))
        {
            Some((b, se)) => match client.validate_event(se, &b.event_proofs) {
                Ok(()) => true,
                Err(e) => {
                    first_error.get_or_insert_with(|| format!("{e:?}"));
                    false
                }
            },
            None => false,
        }
    });
    log_dropped("hint", before - hints.len(), first_error);
}

/// Emit a single aggregated line when a pass dropped anything.
fn log_dropped(kind: &str, count: usize, first_error: Option<String>) {
    if count == 0 {
        return;
    }
    let reason = first_error.unwrap_or_else(|| "missing signed event".to_string());
    crate::logging::log_debug(|| {
        format!("[merge] dropped {count} unvalidated {kind}(s); first reason: {reason}")
    });
}
