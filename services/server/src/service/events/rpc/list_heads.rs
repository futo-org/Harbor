use crate::service::context::ServiceContext;
use crate::service::proto::PublicKey;

use ::entity::event_model as EventModel;

use polycentric_common::models::protos_v2::{
    EventKey, ListHeadsRequest, ListHeadsResponse,
};

use sea_orm::*;
use tonic::Status;

#[derive(Debug, FromQueryResult)]
pub struct HeadInfoRow {
    pub public_key_type: i16,
    pub public_key: Vec<u8>,
    pub collection: i16,
    pub maxseq: i64,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: ListHeadsRequest,
) -> Result<ListHeadsResponse, Status> {
    let db = &ctx.db;

    let query = EventModel::Entity::find()
        .select_only()
        .filter(EventModel::Column::Identity.eq(&req.identity))
        .column(EventModel::Column::PublicKeyType)
        .column(EventModel::Column::PublicKey)
        .column(EventModel::Column::Collection)
        .column_as(EventModel::Column::Sequence.max(), "maxseq")
        .group_by(EventModel::Column::PublicKeyType)
        .group_by(EventModel::Column::PublicKey)
        .group_by(EventModel::Column::Collection)
        .into_model::<HeadInfoRow>();

    let rows = query.all(db).await.map_err(|e| {
        eprintln!("list_heads db error: {e}");
        Status::internal("internal server error")
    })?;

    let output = rows
        .into_iter()
        .map(|row| row_to_event_key(&req.identity, row))
        .collect::<Vec<_>>();

    Ok(ListHeadsResponse { heads: output })
}

fn row_to_event_key(identity: &str, row: HeadInfoRow) -> EventKey {
    EventKey {
        collection: row.collection as i32,
        identity: identity.to_string(),
        signed_by: Some(PublicKey {
            key_type: row.public_key_type as i32,
            key: row.public_key,
        }),
        sequence: row.maxseq as u64,
    }
}
