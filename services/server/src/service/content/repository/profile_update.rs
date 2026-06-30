use super::ChildContext;
use crate::service::proto::ProfileUpdate;
use sea_orm::ConnectionTrait;
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    _db: &C,
    _ctx: &ChildContext<'_>,
    _profile: ProfileUpdate,
) -> Result<(), Status> {
    // TODO: save profile update with avatar/banner digests
    Ok(())
}
