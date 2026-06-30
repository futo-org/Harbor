use super::{ChildContext, map_db_err};
use crate::service::proto::Identity;
use ::entity::content_identity_model as ContentIdentityModel;
use prost::Message;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    identity: Identity,
) -> Result<(), Status> {
    ContentIdentityModel::ActiveModel {
        content_id: Set(ctx.content_id),
        identity: Set(ctx.event_identity.to_string()),
        identity_bytes: Set(identity.encode_to_vec()),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}
