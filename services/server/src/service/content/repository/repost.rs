use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Repost;
use ::entity::content_repost_model as ContentRepostModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    repost: Repost,
) -> Result<(), Status> {
    // A repost with no target is a no-op — the parent `content` row still
    // carries the serialized bytes.
    let Some(post) = repost.post else {
        return Ok(());
    };
    let key = split_event_key(Some(post), "repost")?;

    ContentRepostModel::ActiveModel {
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
