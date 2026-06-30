use super::{ChildContext, map_db_err};
use crate::service::proto::Follow;
use ::entity::content_follow_model as ContentFollowModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    follow: Follow,
) -> Result<(), Status> {
    ContentFollowModel::ActiveModel {
        content_id: Set(ctx.content_id),
        identity_id: Set(follow.identity),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
