//! `get_profile`: the identity's latest profile events plus its
//! follow counters.

use crate::data::{rows_into_bundles, rows_into_hints};
use crate::service::context::ServiceContext;
use crate::service::graph::repository::Query as GraphRepository;
use crate::service::identity::service::{
    list_identity_events, list_profile_events,
};
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{GetProfileRequest, GetProfileResponse};
use tonic::Status;

pub async fn handle(
    ctx: &ServiceContext,
    req: GetProfileRequest,
) -> Result<GetProfileResponse, Status> {
    if req.identity.is_empty() {
        return Err(Status::invalid_argument("identity is required"));
    }

    let profile_rows =
        list_profile_events(ctx, vec![req.identity.clone()]).await?;
    let mut event_bundles = rows_into_bundles(profile_rows);
    attach_proofs(ctx, &mut event_bundles).await?;

    let identity_rows =
        list_identity_events(ctx, vec![req.identity.clone()]).await?;
    // The identity's key chain, so clients can validate the bundles.
    let event_hints = rows_into_hints(identity_rows);

    let following_count =
        GraphRepository::count_following(ctx, &req.identity).await?;

    let followers_count =
        GraphRepository::count_followers(ctx, &req.identity).await?;

    Ok(GetProfileResponse {
        event_bundles,
        event_hints,
        following_count,
        followers_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DbBackend, MockDatabase};
    use std::sync::Arc;

    // Only the sequential guard is tested here. The counters and event listings
    // it composes are covered by the graph repository tests.
    #[tokio::test]
    async fn rejects_an_empty_identity() {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        let ctx = Arc::new(ServiceContext::new(db.clone(), db, kafka_producer));

        let result = handle(
            &ctx,
            GetProfileRequest {
                identity: String::new(),
            },
        )
        .await;
        assert_eq!(result.unwrap_err().code(), tonic::Code::InvalidArgument);
    }
}
