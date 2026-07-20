use std::collections::HashMap;

use polycentric_common::models::protos_v2::EventBundle;

use crate::service::{
    events::{TargetEventKey, tombstone::EventWithContentRow},
    identity::service::row_to_bundle,
};

/// Create event bundles from `rows` and populate their metadata as well.
pub fn rows_to_bundles_with_meta(
    rows: Vec<EventWithContentRow>,
    reply_counts: &HashMap<TargetEventKey, i64>,
) -> Vec<EventBundle> {
    rows.into_iter()
        .map(|row| {
            let (event, _) = &row;
            let key = TargetEventKey::of(event);
            with_reply_count(row_to_bundle(row), &key, reply_counts)
        })
        .collect::<Vec<_>>()
}

/// Insert the reply count for `bundle` into its `meta` field.
pub fn with_reply_count(
    mut bundle: EventBundle,
    key: &TargetEventKey,
    reply_counts: &HashMap<TargetEventKey, i64>,
) -> EventBundle {
    if let Some(count) = reply_counts.get(key) {
        let meta = bundle.meta.get_or_insert_default();
        meta.reply_count = Some(i32::try_from(*count).unwrap_or(i32::MAX));
    }

    bundle
}
