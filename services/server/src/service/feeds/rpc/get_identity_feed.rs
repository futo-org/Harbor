//! `get_identity_feed`: posts authored by a specific identity,
//! newest first.

use crate::{
    data::{hydration::HydrationState, pipeline},
    service::{
        context::ServiceContext,
        feeds::{
            repository::{FeedCursor, PageInfo, Query as FeedsRepository},
            rpc::common::{
                self as feeds_pipeline, GetFeedResponseFilter,
                GetFeedResponseView,
            },
            util::map_db_err,
        },
        proto::{GetFeedResponse, GetIdentityFeedRequest},
    },
};
use std::collections::HashSet;
use tonic::Status;

pub struct Params {
    pub common: feeds_pipeline::Params,
    pub identity: String,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: GetIdentityFeedRequest,
    caller: Option<&str>,
) -> Result<GetFeedResponse, Status> {
    if req.identity.is_empty() {
        return Err(Status::invalid_argument("identity is required"));
    }

    let blocked = ctx.block_cache.blocked_set_for_caller(ctx, caller).await?;

    if caller_blocks_subject(caller, &blocked, &req.identity) {
        return blocked_identity_response();
    }

    let common = feeds_pipeline::Params::from_req_params(
        &req.page_params,
        req.omit_labels,
        blocked,
    )?;
    let params = Params {
        common,
        identity: req.identity,
    };

    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;
    Ok(GetFeedResponse {
        event_bundles: result.event_bundles,
        event_hints: result.event_hints,
        page_info: Some(result.page_info.to_proto()?),
    })
}

fn caller_blocks_subject(
    caller: Option<&str>,
    blocked: &HashSet<String>,
    subject: &str,
) -> bool {
    caller.is_some_and(|caller| caller != subject && blocked.contains(subject))
}

/// Produce a terminal empty page (`has_next_page: false`) for profile feeds
/// that the authenticated user has blocked.
fn blocked_identity_response() -> Result<GetFeedResponse, Status> {
    let page_info = PageInfo {
        backward_cursor: FeedCursor::End,
        forward_cursor: FeedCursor::End,
        has_previous_page: false,
        has_next_page: false,
    };
    Ok(GetFeedResponse {
        event_bundles: vec![],
        event_hints: vec![],
        page_info: Some(page_info.to_proto()?),
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<feeds_pipeline::Fetched, Status> {
    let rows = FeedsRepository::list_feed_events_by_identities(
        &ctx.db,
        vec![params.identity.clone()],
        params.common.limit + 1, // Check for next page
        &params.common.cursor_filter,
    )
    .await
    .map_err(map_db_err)?;
    Ok(feeds_pipeline::finalize_fetch(rows, &params.common))
}

async fn hydrate(
    ctx: &ServiceContext,
    _params: &Params,
    fetched: &feeds_pipeline::Fetched,
) -> Result<HydrationState, Status> {
    feeds_pipeline::hydrate(ctx, fetched).await
}

async fn filter(
    _ctx: &ServiceContext,
    _params: &Params,
    fetched: feeds_pipeline::Fetched,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    feeds_pipeline::filter(
        fetched,
        hydration,
        &_params.common.omit_labels,
        &_params.common.blocked,
    )
    .await
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::content::ContentBody;
    use crate::service::proto::{Block, Content};
    use ::entity::content_model as ContentModel;
    use ::entity::event_model as EventModel;
    use polycentric_common::models::collections;
    use prost::Message;
    use sea_orm::prelude::TimeDateTimeWithTimeZone;
    use sea_orm::{DbBackend, MockDatabase, MockRow};
    use std::sync::Arc;

    fn now() -> TimeDateTimeWithTimeZone {
        TimeDateTimeWithTimeZone::from_unix_timestamp(0).unwrap()
    }

    fn graph_event_row(id: i64, identity: &str) -> EventModel::Model {
        EventModel::Model {
            id,
            collection: collections::SOCIAL_GRAPH as i16,
            identity: identity.to_string(),
            public_key_type: 1,
            public_key: vec![0xaa],
            sequence: id,
            content_digest_type: Some(1),
            content_digest_bytes: Some(vec![id as u8]),
            signature: vec![],
            previous_signature: vec![],
            previous_root: vec![],
            event_bytes: vec![id as u8],
            created_at: now(),
            synced_at: now(),
        }
    }

    fn block_content_row(id: i64, target: &str) -> ContentModel::Model {
        let content = Content {
            content_body: Some(ContentBody::Block(Block {
                identity: target.to_string(),
            })),
        };
        ContentModel::Model {
            id,
            digest_type: 1,
            digest_bytes: vec![id as u8],
            serialized_bytes: content.encode_to_vec(),
            synced_at: now(),
        }
    }

    async fn ctx_where_alice_blocks_bob() -> Arc<ServiceContext> {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_query_results([vec![(
                graph_event_row(1, "alice"),
                block_content_row(1, "bob"),
            )]])
            .append_query_results([Vec::<MockRow>::new()])
            .into_connection();
        let kafka_producer = common_kafka::build_producer()
            .await
            .expect("failed to build Kafka producer");
        ServiceContext::new(db, kafka_producer)
    }

    #[tokio::test]
    async fn a_blocked_identity_feed_is_empty_and_terminal() {
        let ctx = ctx_where_alice_blocks_bob().await;

        let response = handle(
            &ctx,
            GetIdentityFeedRequest {
                identity: "bob".to_string(),
                ..Default::default()
            },
            Some("alice"),
        )
        .await
        .unwrap();

        assert!(response.event_bundles.is_empty());
        assert!(response.event_hints.is_empty());

        let page_info = response.page_info.unwrap();
        assert!(!page_info.has_next_page);
        assert!(!page_info.has_previous_page);
        assert!(matches!(
            FeedCursor::decode(&page_info.start_cursor).unwrap(),
            FeedCursor::End
        ));
        assert!(matches!(
            FeedCursor::decode(&page_info.end_cursor).unwrap(),
            FeedCursor::End
        ));
    }

    #[tokio::test]
    async fn an_empty_identity_is_rejected() {
        let ctx = ctx_where_alice_blocks_bob().await;

        let result =
            handle(&ctx, GetIdentityFeedRequest::default(), Some("alice"))
                .await;

        assert_eq!(result.unwrap_err().code(), tonic::Code::InvalidArgument);
    }
}
