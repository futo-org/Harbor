use tonic::Status;

use crate::service::context::AuthContext;
use crate::service::events::TargetEventKey;
use crate::service::notifications::changes;
use crate::service::notifications::repository::{Mutation, Query};
use crate::service::proto::{
    AcknowledgeNotificationsRequest, AcknowledgeNotificationsResponse,
};

pub async fn handle(
    ctx: AuthContext,
    request: AcknowledgeNotificationsRequest,
) -> Result<AcknowledgeNotificationsResponse, Status> {
    let identity = ctx.identity();
    let last_seen =
        TargetEventKey::from_request(request.last_seen, "last_seen")?;

    let up_to = match Query::id_of_trigger(&ctx.db, identity, &last_seen)
        .await
        .map_err(internal)?
    {
        Some(id) => id,
        // Not produced here, so this server has nothing newer to show.
        None => Query::newest_id(&ctx.db, identity)
            .await
            .map_err(internal)?
            .unwrap_or(0),
    };

    Mutation::mark_read(&ctx.db, identity, up_to)
        .await
        .map_err(internal)?;

    if let Err(e) = changes::notify(&ctx.db, identity).await {
        tracing::warn!(error = %e, "acknowledge_notifications notify error");
    }

    Ok(AcknowledgeNotificationsResponse {})
}

fn internal(e: sea_orm::DbErr) -> Status {
    tracing::error!(error = %e, "acknowledge_notifications db error");
    Status::internal("internal server error")
}
