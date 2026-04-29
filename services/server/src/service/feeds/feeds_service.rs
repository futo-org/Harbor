use super::feeds_repository::{self as FeedsRepository, FeedRow};
use crate::service::proto::feeds_service_server::{
    FeedsService, FeedsServiceServer,
};
use crate::service::proto::{
    EventBundle, FeedAlgorithm, GetFeedRequest, GetFeedResponse,
    SerializedContent, SignedEvent,
};
use tonic::{Request, Response, Status};

#[derive(Debug)]
pub struct FeedsServiceImpl {
    db: sea_orm::DatabaseConnection,
}

/// Implementation of the FeedsService
#[tonic::async_trait]
impl FeedsService for FeedsServiceImpl {
    // Return a curated feed based on the request inputs
    async fn get_feed(
        &self,
        request: Request<GetFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        let inner_req = request.into_inner();
        let limit = inner_req.limit.unwrap_or(50).clamp(1, 200) as u64;
        let algorithm = FeedAlgorithm::try_from(inner_req.algorithm)
            .unwrap_or(FeedAlgorithm::Unspecified);

        let rows = match algorithm {
            FeedAlgorithm::Following => {
                let caller = inner_req.identity.ok_or_else(|| {
                    Status::invalid_argument(
                        "identity is required for FEED_ALGORITHM_FOLLOWING",
                    )
                })?;

                let mut identities =
                    FeedsRepository::Query::list_followed_identities(
                        &self.db, &caller,
                    )
                    .await
                    .map_err(map_db_err)?;

                // Include the caller's own posts in the feed.
                if !identities.iter().any(|a| a == &caller) {
                    identities.push(caller.clone());
                }

                eprintln!(
                    "get_feed FOLLOWING: caller={caller} identities={}",
                    identities.len()
                );
                for a in &identities {
                    eprintln!("  author -> {a}");
                }

                let rows =
                    FeedsRepository::Query::list_feed_events_by_identities(
                        &self.db, identities, limit,
                    )
                    .await
                    .map_err(map_db_err)?;

                eprintln!("get_feed FOLLOWING: returning {} posts", rows.len());
                rows
            }
            // SUGGESTED / UNSPECIFIED: recent Feed events across all
            // identities.  Ranking is not yet implemented.
            _ => FeedsRepository::Query::list_feed_events(&self.db, limit)
                .await
                .map_err(map_db_err)?,
        };

        let reply = GetFeedResponse {
            event_bundles: rows_to_bundles(rows),
            next_token: String::new(),
            previous_token: String::new(),
        };
        Ok(Response::new(reply))
    }
}

fn rows_to_bundles(rows: Vec<FeedRow>) -> Vec<EventBundle> {
    rows.into_iter()
        .map(|(event, content)| EventBundle {
            signed_event: Some(SignedEvent {
                event_bytes: event.event_bytes,
                signature: event.signature,
            }),
            serialized_content: content.map(|c| SerializedContent {
                content_bytes: c.serialized_bytes,
            }),
        })
        .collect()
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    eprintln!("get_feed db error: {e}");
    Status::internal("internal server error")
}

pub fn build_feeds_service(
    db: sea_orm::DatabaseConnection,
) -> FeedsServiceServer<FeedsServiceImpl> {
    FeedsServiceServer::new(FeedsServiceImpl { db })
}
