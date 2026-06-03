use ::entity::content_model as ContentModel;
use ::entity::event_model as EventModel;
use polycentric_common::models::collections;
use prost::Message;
use sea_orm::*;
use std::collections::HashSet;
use tonic::Status;

use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{self, EventWithContentRow};
use crate::service::feeds::repository::content_join;
use crate::service::proto::Content;
use crate::service::proto::content::ContentBody;

const GRAPH_COLLECTION: i16 = collections::SOCIAL_GRAPH as i16;

pub struct Query;

impl Query {
    /// Return the list of identities that `caller` has followed,
    /// excluding any Follow event tombstoned by a *valid* Delete
    /// event.
    ///
    /// Follow → Unfollow → Follow-again resolves to "following"
    /// because the re-follow event has a fresh sequence and no
    /// valid Delete points at it.
    ///
    /// TODO: We can either cache these OR keep a follower table that we update on ingest.
    /// This current query is inefficient.
    pub async fn list_followed_identities(
        ctx: &ServiceContext,
        caller: &str,
    ) -> Result<Vec<String>, Status> {
        let rows: Vec<EventWithContentRow> = EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::InnerJoin, content_join())
            .filter(EventModel::Column::Collection.eq(GRAPH_COLLECTION))
            .filter(EventModel::Column::Identity.eq(caller))
            .all(&ctx.db)
            .await
            .map_err(map_db_err)?;

        let keys: Vec<TargetEventKey> = rows
            .iter()
            .map(|(event, _)| TargetEventKey::of(event))
            .collect();
        let raw_tombstones =
            tombstone::list_tombstones_for_event_keys(&ctx.db, &keys)
                .await
                .map_err(map_db_err)?;
        let valid_tombstones =
            tombstone::validate_tombstones(ctx, raw_tombstones).await?;

        let mut seen: HashSet<String> = HashSet::new();
        let mut result: Vec<String> = Vec::new();
        for (event, content) in rows {
            let key = TargetEventKey::of(&event);
            if valid_tombstones.contains_key(&key) {
                continue;
            }
            let Some(content) = content else { continue };
            if let Some(identity) = decode_followed_identity(&content)
                && seen.insert(identity.clone())
            {
                result.push(identity);
            }
        }
        Ok(result)
    }
}

/// Identity of the target of a Follow event, decoded from the
/// parent content row.
fn decode_followed_identity(
    content: &::entity::content_model::Model,
) -> Option<String> {
    let decoded = Content::decode(content.serialized_bytes.as_slice()).ok()?;
    match decoded.content_body? {
        ContentBody::Follow(follow) => {
            Some(follow.identity).filter(|s| !s.is_empty())
        }
        _ => None,
    }
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    eprintln!("graph repository db error: {e}");
    Status::internal("internal server error")
}
