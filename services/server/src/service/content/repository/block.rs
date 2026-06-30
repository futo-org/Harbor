use super::{ChildContext, map_db_err};
use crate::service::proto::Block;
use ::entity::content_block_model as ContentBlockModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    block: Block,
) -> Result<(), Status> {
    ContentBlockModel::ActiveModel {
        content_id: Set(ctx.content_id),
        identity_id: Set(block.identity),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
