use super::feeds_repository::{self as FeedsRepository, FeedRow};
use crate::service::proto::feeds_service_server::{
    FeedsService, FeedsServiceServer,
};
use crate::service::proto::{
    EventBundle, EventHint, FeedPageParams, GetExploreFeedRequest,
    GetFeedResponse, GetFollowingFeedRequest, GetIdentityFeedRequest,
    GetPostThreadRequest, GetPostThreadResponse, SerializedContent,
    SignedEvent,
};
use tonic::{Request, Response, Status};

#[derive(Debug)]
pub struct FeedsServiceImpl {
    db: sea_orm::DatabaseConnection,
}

fn page_limit(page_params: &Option<FeedPageParams>) -> u64 {
    page_params
        .as_ref()
        .and_then(|p| p.limit)
        .unwrap_or(50)
        .clamp(1, 200) as u64
}

/// Implementation of the FeedsService
#[tonic::async_trait]
impl FeedsService for FeedsServiceImpl {
    /// Posts authored by a specific identity, newest first.
    async fn get_identity_feed(
        &self,
        request: Request<GetIdentityFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        let inner_req = request.into_inner();
        let limit = page_limit(&inner_req.page_params);

        if inner_req.identity.is_empty() {
            return Err(Status::invalid_argument("identity is required"));
        }

        let rows = FeedsRepository::Query::list_feed_events_by_identities(
            &self.db,
            vec![inner_req.identity],
            limit,
        )
        .await
        .map_err(map_db_err)?;

        let event_hints = build_profile_hints(&self.db, &rows).await?;

        Ok(Response::new(GetFeedResponse {
            event_bundles: rows_to_bundles(rows),
            event_hints,
        }))
    }

    /// Posts from identities the caller follows, newest first. Falls back
    /// to an empty feed when the caller has not followed anyone yet.
    async fn get_following_feed(
        &self,
        request: Request<GetFollowingFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        let inner_req = request.into_inner();
        let limit = page_limit(&inner_req.page_params);

        if inner_req.follower_identity.is_empty() {
            return Err(Status::invalid_argument(
                "follower_identity is required",
            ));
        }
        let caller = inner_req.follower_identity;

        let mut identities =
            FeedsRepository::Query::list_followed_identities(&self.db, &caller)
                .await
                .map_err(map_db_err)?;

        // Include the caller's own posts in their following feed.
        if !identities.iter().any(|a| a == &caller) {
            identities.push(caller.clone());
        }

        let rows = FeedsRepository::Query::list_feed_events_by_identities(
            &self.db, identities, limit,
        )
        .await
        .map_err(map_db_err)?;

        let event_hints = build_profile_hints(&self.db, &rows).await?;

        Ok(Response::new(GetFeedResponse {
            event_bundles: rows_to_bundles(rows),
            event_hints,
        }))
    }

    /// Server-curated explore feed: recent Feed events across all
    /// identities. Ranking is not yet implemented.
    async fn get_explore_feed(
        &self,
        request: Request<GetExploreFeedRequest>,
    ) -> Result<Response<GetFeedResponse>, Status> {
        let inner_req = request.into_inner();
        let limit = page_limit(&inner_req.page_params);

        let rows = FeedsRepository::Query::list_feed_events(&self.db, limit)
            .await
            .map_err(map_db_err)?;

        let event_hints = build_profile_hints(&self.db, &rows).await?;

        Ok(Response::new(GetFeedResponse {
            event_bundles: rows_to_bundles(rows),
            event_hints,
        }))
    }

    // Return the thread for the subject post: ancestors (root → direct
    // parent), the subject itself, then descendants (direct replies for now).
    async fn get_post_thread(
        &self,
        request: Request<GetPostThreadRequest>,
    ) -> Result<Response<GetPostThreadResponse>, Status> {
        let inner_req = request.into_inner();

        let descendants_limit = if inner_req.limit <= 0 {
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

        let subject_row = FeedsRepository::Query::find_event_by_key(
            &self.db,
            collection,
            &event_key.identity,
            public_key_type,
            signed_by.key,
            sequence,
        )
        .await
        .map_err(map_db_err)?
        .ok_or_else(|| Status::not_found("event not found"))?;
        let subject_id = subject_row.0.id;

        const PARENT_HEIGHT_LIMIT: i32 = 50;
        const DESCENDANT_DEPTH_LIMIT: i32 = 50;

        let ancestor_refs = FeedsRepository::Query::list_ancestor_refs(
            &self.db,
            subject_id,
            PARENT_HEIGHT_LIMIT,
        )
        .await
        .map_err(map_db_err)?;

        let descendant_refs = FeedsRepository::Query::list_descendant_refs(
            &self.db,
            subject_id,
            DESCENDANT_DEPTH_LIMIT,
            descendants_limit,
        )
        .await
        .map_err(map_db_err)?;

        // Build parent → [children, newest-first]. Order is (depth ASC, created_at DESC),
        // so per-parent order is newest first
        let mut children_by_parent: std::collections::HashMap<i64, Vec<i64>> =
            std::collections::HashMap::new();
        for r in &descendant_refs {
            children_by_parent
                .entry(r.parent_event_id)
                .or_default()
                .push(r.event_id);
        }

        // Only allow one 'branch' per thread
        // We pick the newest of the last thread item.
        const BRANCHING_FACTOR: usize = 1;
        let mut descendant_order: Vec<i64> = Vec::new();
        let mut stack: Vec<(i64, bool)> = Vec::new();
        if let Some(direct) = children_by_parent.get(&subject_id) {
            // Push reversed so the first direct reply is popped first.
            for &id in direct.iter().rev() {
                stack.push((id, false));
            }
        }
        while let Some((id, _)) = stack.pop() {
            descendant_order.push(id);
            if let Some(kids) = children_by_parent.get(&id) {
                let take = kids.len().min(BRANCHING_FACTOR);
                for &kid in kids.iter().take(take).rev() {
                    stack.push((kid, true));
                }
            }
        }

        let mut all_ids: Vec<i64> =
            Vec::with_capacity(ancestor_refs.len() + descendant_order.len());
        all_ids.extend(ancestor_refs.iter().map(|r| r.event_id));
        all_ids.extend(descendant_order.iter().copied());
        let mut by_id: std::collections::HashMap<i64, FeedRow> =
            FeedsRepository::Query::list_events_by_ids(&self.db, all_ids)
                .await
                .map_err(map_db_err)?
                .into_iter()
                .map(|row| (row.0.id, row))
                .collect();

        let mut thread: Vec<FeedRow> = Vec::with_capacity(
            ancestor_refs.len() + 1 + descendant_order.len(),
        );
        for r in &ancestor_refs {
            if let Some(row) = by_id.remove(&r.event_id) {
                thread.push(row);
            }
        }
        thread.push(subject_row);
        for id in &descendant_order {
            if let Some(row) = by_id.remove(id) {
                thread.push(row);
            }
        }

        let event_hints = build_profile_hints(&self.db, &thread).await?;

        Ok(Response::new(GetPostThreadResponse {
            thread: rows_to_bundles(thread),
            event_hints,
        }))
    }
}

/// Build the `event_hints` for a feed/thread response: collect the
/// unique author identities from `rows`, fetch the latest PROFILE
/// event for each, and wrap them in `EventHint`s. Returned as a
/// `Status` error if the DB lookup fails.
async fn build_profile_hints(
    db: &sea_orm::DatabaseConnection,
    rows: &[FeedRow],
) -> Result<Vec<EventHint>, Status> {
    let identities: Vec<String> = rows
        .iter()
        .map(|(event, _)| event.identity.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let profile_rows =
        FeedsRepository::Query::list_latest_profiles_for_identities(
            db, identities,
        )
        .await
        .map_err(map_db_err)?;

    Ok(rows_to_bundles(profile_rows)
        .into_iter()
        .map(|b| EventHint {
            event_bundle: Some(b),
        })
        .collect())
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
    eprintln!("feeds_service db error: {e}");
    Status::internal("internal server error")
}

pub fn build_feeds_service(
    db: sea_orm::DatabaseConnection,
) -> FeedsServiceServer<FeedsServiceImpl> {
    FeedsServiceServer::new(FeedsServiceImpl { db })
}
