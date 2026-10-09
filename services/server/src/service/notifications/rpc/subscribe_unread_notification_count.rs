use std::sync::Arc;

use tokio::sync::broadcast::error::RecvError;
use tokio::sync::{broadcast, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tonic::codegen::BoxStream;
use tonic::{Request, Status};

use crate::service::auth::authenticated_identity;
use crate::service::context::ServiceContext;
use crate::service::notifications::changes::Change;
use crate::service::notifications::repository::Query;
use crate::service::proto::{
    SubscribeUnreadNotificationCountRequest,
    SubscribeUnreadNotificationCountResponse,
};

/// Counting stops here; the client shows anything at the cap as "99+".
const MAX_COUNT: u64 = 100;

pub type CountStream = BoxStream<SubscribeUnreadNotificationCountResponse>;

/// Sends the current count, then a new one each time `changes` names the
/// identity (or everyone) and the count differs.
pub async fn handle(
    ctx: Arc<ServiceContext>,
    request: Request<SubscribeUnreadNotificationCountRequest>,
    mut changes: broadcast::Receiver<Change>,
) -> Result<CountStream, Status> {
    let identity = authenticated_identity(&request)
        .ok_or_else(|| Status::unauthenticated("authentication required"))?;

    let initial = count(&ctx, &identity).await?;
    let (tx, rx) = mpsc::channel(4);
    let _ = tx.try_send(Ok(response(initial)));

    tokio::spawn(async move {
        let mut last = initial;
        loop {
            let changed = tokio::select! {
                _ = tx.closed() => return,
                changed = changes.recv() => changed,
            };
            match changed {
                Ok(Change::Identity(changed)) if *changed != *identity => {
                    continue;
                }
                Ok(_) | Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => return,
            }
            match count(&ctx, &identity).await {
                Ok(current) if current != last => {
                    last = current;
                    if tx.send(Ok(response(current))).await.is_err() {
                        return;
                    }
                }
                Ok(_) => {}
                Err(status) => {
                    tracing::warn!(error = %status, "unread count refresh failed")
                }
            }
        }
    });

    Ok(Box::pin(ReceiverStream::new(rx)))
}

/// Reads the primary: a change arrives before any replica has the row.
async fn count(ctx: &ServiceContext, identity: &str) -> Result<u64, Status> {
    Query::unread_count(&ctx.db, identity, MAX_COUNT)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "unread count db error");
            Status::internal("internal server error")
        })
}

fn response(count: u64) -> SubscribeUnreadNotificationCountResponse {
    SubscribeUnreadNotificationCountResponse {
        count: count as u32,
    }
}
