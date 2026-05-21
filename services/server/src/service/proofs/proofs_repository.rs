//! Database access for EventProof generation.

use ::entity::event_model as EventModel;
use polycentric_common::models::protos_v2::Event;
use prost::Message;
use sea_orm::*;

/// Canonically-ordered signatures in `(identity, collection)`. Sorted by
/// `sum(vector_clock)`, then `created_at`, then signature.
pub async fn canonical_signatures(
    db: &DbConn,
    identity: &str,
    collection: i32,
) -> Result<Vec<Vec<u8>>, DbErr> {
    let rows = EventModel::Entity::find()
        .filter(EventModel::Column::Collection.eq(collection as i16))
        .filter(EventModel::Column::Identity.eq(identity))
        .all(db)
        .await?;
    let mut decoded: Vec<(u64, u64, Vec<u8>)> = rows
        .into_iter()
        .filter_map(|row| {
            let inner = Event::decode(row.event_bytes.as_slice()).ok()?;
            let vc_sum: u64 = inner
                .vector_clock
                .as_ref()
                .map(|vc| vc.sequence.iter().sum())
                .unwrap_or(0);
            Some((vc_sum, inner.created_at, row.signature))
        })
        .collect();
    decoded.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| a.1.cmp(&b.1))
            .then_with(|| a.2.cmp(&b.2))
    });
    Ok(decoded.into_iter().map(|(_, _, s)| s).collect())
}
