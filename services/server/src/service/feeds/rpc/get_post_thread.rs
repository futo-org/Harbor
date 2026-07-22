//! `get_post_thread`: ancestors (root → direct parent), the subject
//! itself, then descendants (one branch deep for now).

use crate::data::hydration::HydrationState;
use crate::data::pipeline;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::EventWithContentRow;
use crate::service::feeds::repository::{FeedCursor, Query as FeedsRepository};
use crate::service::feeds::rpc::common::{
    self as feeds_pipeline, GetFeedResponseFilter, GetFeedResponseView,
};
use crate::service::feeds::util::{PageInfo, map_db_err};
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, EventBundle, GetPostThreadRequest, GetPostThreadResponse,
};
use prost::Message;
use std::collections::{HashMap, HashSet};
use tonic::Status;

const PARENT_HEIGHT_LIMIT: i32 = 50;
const DESCENDANT_DEPTH_LIMIT: i32 = 50;
/// Only one branch per thread for now: at each level we keep the
/// newest child.
const BRANCHING_FACTOR: usize = 1;

pub struct Params {
    pub collection: i16,
    pub identity: String,
    pub public_key_type: i16,
    pub public_key: Vec<u8>,
    pub sequence: i64,
    pub descendants_limit: u64,
    pub omit_labels: Vec<String>,
}

pub async fn handle(
    ctx: &ServiceContext,
    req: GetPostThreadRequest,
) -> Result<GetPostThreadResponse, Status> {
    let descendants_limit = if req.limit <= 0 {
        200
    } else {
        req.limit.min(200) as u64
    };

    let event_key = TargetEventKey::from_request(req.event_key, "event_key")?;

    let params = Params {
        collection: event_key.collection,
        identity: event_key.identity,
        public_key_type: event_key.public_key_type,
        public_key: event_key.public_key,
        sequence: event_key.sequence,
        descendants_limit,
        omit_labels: req.omit_labels,
    };

    let result =
        pipeline::create_pipeline(ctx, &params, fetch, hydrate, filter, view)
            .await?;
    Ok(GetPostThreadResponse {
        thread: result.event_bundles,
        event_hints: result.event_hints,
    })
}

async fn fetch(
    ctx: &ServiceContext,
    params: &Params,
) -> Result<feeds_pipeline::Fetched, Status> {
    let subject_row = FeedsRepository::find_event_by_key(
        &ctx.db,
        params.collection,
        &params.identity,
        params.public_key_type,
        params.public_key.clone(),
        params.sequence,
    )
    .await
    .map_err(map_db_err)?
    .ok_or_else(|| Status::not_found("event not found"))?;
    let subject_id = subject_row.0.id;

    let ancestor_refs = FeedsRepository::list_ancestor_refs(
        &ctx.db,
        subject_id,
        PARENT_HEIGHT_LIMIT,
    )
    .await
    .map_err(map_db_err)?;

    let descendant_refs = FeedsRepository::list_descendant_refs(
        &ctx.db,
        subject_id,
        DESCENDANT_DEPTH_LIMIT,
        params.descendants_limit,
    )
    .await
    .map_err(map_db_err)?;

    // parent → [children, newest-first]. Order is (depth ASC,
    // created_at DESC), so per-parent order is newest first.
    let mut children_by_parent: HashMap<i64, Vec<i64>> = HashMap::new();
    for r in &descendant_refs {
        children_by_parent
            .entry(r.parent_event_id)
            .or_default()
            .push(r.event_id);
    }

    let mut descendant_order: Vec<i64> = Vec::new();
    let mut stack: Vec<(i64, bool)> = Vec::new();
    if let Some(direct) = children_by_parent.get(&subject_id) {
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
    let mut by_id: HashMap<i64, EventWithContentRow> =
        FeedsRepository::list_events_by_ids(&ctx.db, all_ids)
            .await
            .map_err(map_db_err)?
            .into_iter()
            .map(|row| (row.0.id, row))
            .collect();

    let mut thread: Vec<EventWithContentRow> =
        Vec::with_capacity(ancestor_refs.len() + 1 + descendant_order.len());
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
    Ok(feeds_pipeline::Fetched {
        rows: thread,
        page_info: PageInfo {
            backward_cursor: FeedCursor::Start,
            forward_cursor: FeedCursor::End,
            has_previous_page: false,
            has_next_page: false,
        },
    })
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
    params: &Params,
    fetched: feeds_pipeline::Fetched,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    let omit_label_set: HashSet<&str> =
        params.omit_labels.iter().map(|s| s.as_str()).collect();
    let mut live_rows: Vec<EventWithContentRow> =
        Vec::with_capacity(fetched.rows.len());
    let mut tombstone_bundles: Vec<EventBundle> = Vec::new();

    for row in fetched.rows {
        let key = TargetEventKey::of(&row.0);

        // Check tombstone
        if let Some(bundles) = hydration.deletes_by_target.get(&key) {
            tombstone_bundles.extend(bundles.iter().cloned());
            continue;
        }

        if has_matching_label(&hydration.label_events, &key, &omit_label_set) {
            continue;
        }

        live_rows.push(row);
    }

    Ok(GetFeedResponseFilter {
        live_rows,
        tombstone_bundles,
        page_info: fetched.page_info,
    })
}

/// Returns `true` when `key` has at least one label whose value is in
/// `omit_label_set`.
fn has_matching_label(
    label_events: &[EventWithContentRow],
    key: &TargetEventKey,
    omit_label_set: &HashSet<&str>,
) -> bool {
    for label_row in label_events {
        if let Some(label_content) = &label_row.1
            && let Ok(content) =
                Content::decode(label_content.serialized_bytes.as_slice())
            && let Some(ContentBody::Labels(labels)) = content.content_body
            && let Some(lk) = labels.event_key
            && let Some(signed_by) = lk.signed_by
        {
            let label_key = TargetEventKey {
                collection: lk.collection as i16,
                identity: lk.identity,
                public_key_type: signed_by.key_type as i16,
                public_key: signed_by.key,
                sequence: lk.sequence as i64,
            };

            if label_key == *key {
                return labels
                    .label_values
                    .iter()
                    .any(|v| omit_label_set.contains(v.as_str()));
            }
        }
    }
    false
}

async fn view(
    ctx: &ServiceContext,
    _params: &Params,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    feeds_pipeline::view(ctx, filtered, hydration).await
}
