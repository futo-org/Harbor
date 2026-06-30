use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Delete;
use ::entity::content_delete_model as ContentDeleteModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    delete: Delete,
) -> Result<(), Status> {
    let key = split_event_key(delete.event_key, "delete content")?;

    ContentDeleteModel::ActiveModel {
        content_id: Set(ctx.content_id),
        event_key_collection: Set(key.collection),
        event_key_identity: Set(key.identity),
        event_key_public_key_type: Set(key.public_key_type),
        event_key_public_key: Set(key.public_key),
        event_key_sequence: Set(key.sequence),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
