use sea_orm::ConnectionTrait;
use tonic::Status;

use polycentric_common::models::protos_v2::{
    EventKey, ListHeadsRequest, ListHeadsResponse,
};

use crate::service::context::PublicContext;
use crate::service::events::repository as EventsRepository;
use crate::service::events::repository::HeadInfoRow;
use crate::service::proto::PublicKey;

pub async fn handle(
    ctx: PublicContext,
    req: ListHeadsRequest,
) -> Result<ListHeadsResponse, Status> {
    heads(&ctx.db, &req.identity).await
}

/// The heads of `identity` as stored in `db`.
pub async fn heads<C: ConnectionTrait>(
    db: &C,
    identity: &str,
) -> Result<ListHeadsResponse, Status> {
    let rows = EventsRepository::Query::list_heads(db, identity)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "list_heads db error");
            Status::internal("internal server error")
        })?;

    let output = rows
        .into_iter()
        .map(|row| row_to_event_key(identity, row))
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
        sequence: row.max_seq as u64,
    }
}
