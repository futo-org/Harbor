use super::{ChildContext, map_db_err, split_event_key};
use crate::service::proto::Report;
use ::entity::content_report_model as ContentReportModel;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    report: Report,
) -> Result<(), Status> {
    let key = split_event_key(report.event_key, "report content")?;

    ContentReportModel::ActiveModel {
        content_id: Set(ctx.content_id),
        category: Set(report.category as i16),
        additional_info: Set(report.additional_info),
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
