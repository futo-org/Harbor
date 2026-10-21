use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::codegen::BoxStream;
use tonic::{Request, Status};

use polycentric_common::models::protos_v2::{
    ListHeadsResponse, SubscribeHeadsRequest,
};

use crate::service::auth::authenticated_identity;
use crate::service::events::heads_pubsub::HeadsPubSub;

pub type HeadsStream = BoxStream<ListHeadsResponse>;

/// Sends the current heads, then the latest each time they move (coalesced).
pub async fn handle(
    pubsub: Option<&'static HeadsPubSub>,
    request: Request<SubscribeHeadsRequest>,
) -> Result<HeadsStream, Status> {
    let identity = authenticated_identity(&request)
        .ok_or_else(|| Status::unauthenticated("authentication required"))?;
    let pubsub = pubsub.ok_or_else(|| {
        Status::unimplemented("live sync is not enabled on this server")
    })?;
    let mut subscription = pubsub.subscribe(&identity).await?;

    let (tx, rx) = mpsc::channel(1);
    tokio::spawn(async move {
        let heads = subscription.heads();
        loop {
            let current = heads.borrow_and_update().to_response();
            if tx.send(Ok(current)).await.is_err() {
                return;
            }
            tokio::select! {
                _ = tx.closed() => return,
                changed = heads.changed() => if changed.is_err() {
                    return;
                },
            }
        }
    });

    Ok(Box::pin(ReceiverStream::new(rx)))
}
