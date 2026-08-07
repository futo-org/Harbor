//! Database access for EventProof generation.

use ::entity::event_model as EventModel;
use polycentric_common::merkle;
use sea_orm::*;

/// Canonically-ordered signatures in `(identity, collection)`. Delegates
/// to [`polycentric_common::merkle::canonical_signatures`] so client and
/// server agree on the ordering.
pub async fn canonical_signatures<C: ConnectionTrait>(
    db: &C,
    identity: &str,
    collection: i32,
) -> Result<Vec<Vec<u8>>, DbErr> {
    let rows = EventModel::Entity::find()
        .filter(EventModel::Column::Collection.eq(collection as i16))
        .filter(EventModel::Column::Identity.eq(identity))
        .all(db)
        .await?;
    Ok(merkle::canonical_signatures(rows.iter().map(|r| {
        (r.event_bytes.as_slice(), r.signature.as_slice())
    })))
}
