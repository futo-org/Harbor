use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Labels;
use ::entity::content_label_model as ContentLabelModel;
use sea_orm::{ActiveValue::Set, ConnectionTrait, EntityTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    labels: Labels,
) -> Result<(), Status> {
    let key = split_event_key(labels.event_key, "labels content")?;

    // One row per label value for efficient aggregation; the labeled
    // event's key is denormalized onto each row.
    let rows: Vec<ContentLabelModel::ActiveModel> = labels
        .label_values
        .into_iter()
        .map(|label_value| ContentLabelModel::ActiveModel {
            content_id: Set(ctx.content_id),
            label_value: Set(label_value),
            event_key_collection: Set(key.collection),
            event_key_identity: Set(key.identity.clone()),
            event_key_public_key_type: Set(key.public_key_type),
            event_key_public_key: Set(key.public_key.clone()),
            event_key_sequence: Set(key.sequence),
        })
        .collect();

    if !rows.is_empty() {
        ContentLabelModel::Entity::insert_many(rows)
            .exec(db)
            .await
            .map_err(map_db_err)?;
    }

    Ok(())
}
