use tonic::{Request, Status};

use crate::service::auth::authenticated_identity;
use crate::service::context::ServiceContext;
use crate::service::notifications::changes;
use crate::service::notifications::repository::Mutation;
use crate::service::proto::{
    AcknowledgeNotificationsRequest, AcknowledgeNotificationsResponse,
};

pub async fn handle(
    ctx: &ServiceContext,
    request: Request<AcknowledgeNotificationsRequest>,
) -> Result<AcknowledgeNotificationsResponse, Status> {
    let identity = authenticated_identity(&request)
        .ok_or_else(|| Status::unauthenticated("authentication required"))?;

    Mutation::mark_read(&ctx.db, &identity).await.map_err(|e| {
        tracing::error!(error = %e, "acknowledge_notifications db error");
        Status::internal("internal server error")
    })?;

    if let Err(e) = changes::notify(&ctx.db, &identity).await {
        tracing::warn!(error = %e, "acknowledge_notifications notify error");
    }

    Ok(AcknowledgeNotificationsResponse {})
}
