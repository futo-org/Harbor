use super::feeds_repository::{self as FeedsRepository, FeedRow};
use crate::service::proto::feeds_service_server::{
    FeedsService, FeedsServiceServer,
};
use crate::service::proto::{
    EventBundle, FeedAlgorithm, GetFeedRequest, GetFeedResponse,
    GetPostThreadRequest, GetPostThreadResponse, SerializedContent,
    SignedEvent,
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

    // Return a parent post and its direct replies.
    async fn get_post_thread(
        &self,
        request: Request<GetPostThreadRequest>,
    ) -> Result<Response<GetPostThreadResponse>, Status> {
        let inner_req = request.into_inner();

        let limit = if inner_req.limit <= 0 {
            200
        } else {
            inner_req.limit.min(200) as u64
        };

        let event_key = inner_req
            .event_key
            .ok_or_else(|| Status::invalid_argument("event_key is required"))?;
        let signed_by = event_key.signed_by.ok_or_else(|| {
            Status::invalid_argument("event_key.signed_by is required")
        })?;

        let collection: i16 =
            event_key.collection.try_into().map_err(|_| {
                Status::invalid_argument("event_key.collection out of range")
            })?;
        let public_key_type: i16 =
            signed_by.key_type.try_into().map_err(|_| {
                Status::invalid_argument(
                    "event_key.signed_by.key_type out of range",
                )
            })?;
        let sequence: i16 = event_key.sequence.try_into().map_err(|_| {
            Status::invalid_argument("event_key.sequence out of range")
        })?;

        let parent_row = FeedsRepository::Query::find_event_by_key(
            &self.db,
            collection,
            &event_key.identity,
            public_key_type,
            signed_by.key.clone(),
            sequence,
        )
        .await
        .map_err(map_db_err)?
        .ok_or_else(|| Status::not_found("parent event not found"))?;

        let reply_rows =
            FeedsRepository::Query::list_replies_by_parent_event_key(
                &self.db,
                collection,
                &event_key.identity,
                public_key_type,
                signed_by.key,
                sequence,
                limit,
            )
            .await
            .map_err(map_db_err)?;

        let parent_bundle =
            rows_to_bundles(vec![parent_row]).into_iter().next();

        let reply = GetPostThreadResponse {
            parent: parent_bundle,
            replies: rows_to_bundles(reply_rows),
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
