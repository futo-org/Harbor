//! Common functions for feed rpc requests
//! Mostly pipeline related

use crate::data::hydration::HydrationState;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{
    self as tombstone, EventWithContentRow,
};
use crate::service::feeds::repository::{
    CursorFilter, FeedCursor, Query as FeedsRepository,
};
use crate::service::feeds::util::{
    PageCursor, PageInfo, map_db_err, page_limit,
};
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
    rows_to_bundles,
};

use crate::service::proofs::service::attach_proofs;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, EventBundle, EventHint, EventKey, PageParams,
};
use prost::Message;
use std::collections::HashSet;
use tonic::Status;

/// Common feed parameters needed for shared pagination logic in `finalize_fetch()`.
pub struct Params {
    pub limit: u64,
    pub cursor_filter: Option<CursorFilter>,
}

impl Params {
    /// Extract values from the client request's page params.
    pub fn from_req_params(
        params: &Option<PageParams>,
    ) -> Result<Params, Status> {
        let limit = page_limit(params);

        let tokens = params
            .as_ref()
            .map(|p| (&p.backward_token, &p.forward_token));

        let cursor_filter = match tokens {
            Some((Some(_), Some(_))) => {
                return Err(Status::invalid_argument(
                    "Only one cursor is allowed",
                ));
            }
            Some((Some(token), None)) => {
                Option::<FeedCursor>::decode(token)?.map(CursorFilter::Backward)
            }
            Some((None, Some(token))) => {
                Option::<FeedCursor>::decode(token)?.map(CursorFilter::Forward)
            }
            _ => None,
        };

        Ok(Params {
            limit,
            cursor_filter,
        })
    }
}

pub struct Fetched {
    pub rows: Vec<EventWithContentRow>,
    pub page_info: PageInfo<Option<FeedCursor>>,
}

#[derive(Default)]
pub struct GetFeedResponseFilter {
    pub live_rows: Vec<EventWithContentRow>,
    pub tombstone_bundles: Vec<EventBundle>,
    pub page_info: PageInfo<Option<FeedCursor>>,
}

#[derive(Default)]
pub struct GetFeedResponseView {
    pub event_bundles: Vec<EventBundle>,
    pub event_hints: Vec<EventHint>,
    pub page_info: PageInfo<Option<FeedCursor>>,
}

/// Remove the extra row (for checking next page existence) and extract page info.
/// Return the final fetch stage result.
pub fn finalize_fetch(
    mut rows: Vec<EventWithContentRow>,
    params: &Params,
) -> Fetched {
    // We tried fetching more rows than the client limit.
    // If we got more back, then there is more data past the page we will return.
    let has_extra_row = rows.len() as u64 > params.limit;

    // Simple heuristic: if a forward token was used, then there was a previous page.
    // False negative when going forward then backward that we do not handle.
    // Other direction applies as well.
    let cursor_was_used = params.cursor_filter.is_some();

    let (has_previous_page, has_next_page) = match params.cursor_filter {
        Some(CursorFilter::Backward(_)) => {
            // Backwards queries have a cursor if there is a page following this one
            // and the extra row would be preceding the current page.
            (has_extra_row, cursor_was_used)
        }
        _ => (cursor_was_used, has_extra_row),
    };

    // Remove from the end if we fetched extra rows at the end
    // and remove from the beginning if we are doing a backwards query
    match params.cursor_filter {
        Some(CursorFilter::Backward(_)) => {
            let drop = rows.len().saturating_sub(params.limit as usize);
            rows.drain(0..drop);
        }
        _ => rows.truncate(params.limit as usize),
    }

    let backward_cursor = rows.first().map(|(event, _)| FeedCursor {
        created_at: event.created_at,
        id: event.id,
    });

    let forward_cursor = rows.last().map(|(event, _)| FeedCursor {
        created_at: event.created_at,
        id: event.id,
    });

    let page_info = PageInfo {
        backward_cursor,
        forward_cursor,
        has_previous_page,
        has_next_page,
    };

    Fetched { rows, page_info }
}

/// Return relevant content such as:
/// - tombstones for the queried rows
/// - latest identity events (rotation/signing chain) for every
///   identity referenced
/// - latest profile event (display name / avatar / banner) for every
///   identity referenced
pub async fn hydrate(
    ctx: &ServiceContext,
    fetched: &Fetched,
) -> Result<HydrationState, Status> {
    let rows = &fetched.rows;

    let keys: Vec<TargetEventKey> =
        rows.iter().map(|(e, _)| TargetEventKey::of(e)).collect();
    let identities = collect_identities(rows);
    let (quote_keys, repost_keys) = collect_referenced_keys(rows);

    // Returns valid (as far as the server is concerned) tombstones related to queried events
    let tombstones_fut = async {
        let raw = tombstone::list_tombstones_for_event_keys(&ctx.db, &keys)
            .await
            .map_err(map_db_err)?;
        tombstone::validate_tombstones(ctx, raw).await
    };
    let identity_events_fut = list_identity_events(ctx, identities.clone());
    let profile_events_fut = list_profile_events(ctx, identities);
    // One query for both quote + repost targets; split the result by
    // matching each fetched row against the two key sets.
    let referenced_fut = async {
        let all_keys: Vec<EventKey> =
            quote_keys.iter().chain(&repost_keys).cloned().collect();
        FeedsRepository::list_events_by_keys(&ctx.db, &all_keys)
            .await
            .map_err(map_db_err)
    };

    let (deletes_by_target, identity_events, profile_events, referenced) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
        referenced_fut,
    )?;

    let quote_set = to_target_event_keys(&quote_keys);
    let repost_set = to_target_event_keys(&repost_keys);
    let mut quote_post_events = Vec::new();
    let mut repost_events = Vec::new();
    for row in referenced {
        let key = TargetEventKey::of(&row.0);
        if quote_set.contains(&key) {
            quote_post_events.push(row);
        } else if repost_set.contains(&key) {
            repost_events.push(row);
        }
    }

    Ok(HydrationState {
        deletes_by_target,
        identity_events,
        profile_events,
        quote_post_events,
        repost_events,
    })
}

/// Collect the EventKeys feed rows reference — a Post's `quote` target
/// and a Repost's target — split by kind.
fn collect_referenced_keys(
    rows: &[EventWithContentRow],
) -> (Vec<EventKey>, Vec<EventKey>) {
    let mut quote_keys = Vec::new();
    let mut repost_keys = Vec::new();
    for (_event, content) in rows {
        let Some(content) = content else {
            continue;
        };
        let Ok(decoded) = Content::decode(content.serialized_bytes.as_slice())
        else {
            continue;
        };
        match decoded.content_body {
            Some(ContentBody::Post(post)) => {
                if let Some(quote) = post.quote {
                    quote_keys.push(quote);
                }
            }
            Some(ContentBody::Repost(repost)) => {
                if let Some(target) = repost.post {
                    repost_keys.push(target);
                }
            }
            _ => {}
        }
    }
    (quote_keys, repost_keys)
}

/// Convert proto `EventKey`s into [`TargetEventKey`]s (the shared
/// comparable EventKey shape), deduplicated into a set for the
/// membership tests that split the combined referenced-post result.
fn to_target_event_keys(keys: &[EventKey]) -> HashSet<TargetEventKey> {
    keys.iter()
        .filter_map(|key| {
            let signed_by = key.signed_by.as_ref()?;
            Some(TargetEventKey {
                collection: key.collection as i16,
                identity: key.identity.clone(),
                public_key_type: signed_by.key_type as i16,
                public_key: signed_by.key.clone(),
                sequence: key.sequence as i64,
            })
        })
        .collect()
}

/// Remove all rows that have been marked as deleted.
pub async fn filter(
    fetched: Fetched,
    hydration: &HydrationState,
) -> Result<GetFeedResponseFilter, Status> {
    let Fetched { rows, page_info } = fetched;

    let mut live_rows: Vec<EventWithContentRow> =
        Vec::with_capacity(rows.len());
    let mut tombstone_bundles: Vec<EventBundle> = Vec::new();

    for row in rows {
        let key = TargetEventKey::of(&row.0);
        if let Some(bundles) = hydration.deletes_by_target.get(&key) {
            tombstone_bundles.extend(bundles.iter().cloned());
        } else {
            live_rows.push(row);
        }
    }
    Ok(GetFeedResponseFilter {
        live_rows,
        tombstone_bundles,
        page_info,
    })
}

/// Build bundles from live rows, attach revocation proofs, and merge
/// identity, profile and tombstone hints.
pub async fn view(
    ctx: &ServiceContext,
    filtered: GetFeedResponseFilter,
    hydration: HydrationState,
) -> Result<GetFeedResponseView, Status> {
    let GetFeedResponseFilter {
        live_rows,
        mut tombstone_bundles,
        page_info,
    } = filtered;
    let HydrationState {
        identity_events,
        profile_events,
        quote_post_events,
        repost_events,
        ..
    } = hydration;

    let mut event_bundles = rows_to_bundles(live_rows);
    tokio::try_join!(
        attach_proofs(ctx, &mut event_bundles),
        attach_proofs(ctx, &mut tombstone_bundles),
    )?;

    // Identity, profile and referenced (quote / repost) posts all ship
    // as hints; tombstone bundles join them.
    let hint_rows: Vec<EventWithContentRow> = identity_events
        .into_iter()
        .chain(profile_events)
        .chain(quote_post_events)
        .chain(repost_events)
        .collect();
    let mut event_hints: Vec<EventHint> = rows_to_bundles(hint_rows)
        .into_iter()
        .map(|b| EventHint {
            event_bundle: Some(b),
        })
        .collect();
    event_hints.extend(tombstone_bundles.into_iter().map(|b| EventHint {
        event_bundle: Some(b),
    }));

    Ok(GetFeedResponseView {
        event_bundles,
        event_hints,
        page_info,
    })
}
