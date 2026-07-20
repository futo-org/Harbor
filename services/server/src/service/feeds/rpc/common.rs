//! Common functions for feed rpc requests
//! Mostly pipeline related

use crate::data::hydration::HydrationState;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone::{
    self as tombstone, EventWithContentRow,
};
use crate::service::feeds::repository::{
    CursorFilter, FeedCursor, FeedMarker, Query as FeedsRepository,
};
use crate::service::feeds::util::{
    PageCursor, PageInfo, map_db_err, page_limit,
};
use crate::service::identity::service::{
    bundles_to_hints, collect_identities, list_identity_events,
    list_profile_events, rows_to_bundles,
};

use crate::service::proofs::service::attach_proofs;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, EventBundle, EventHint, EventKey, PageParams,
};
use crate::service::stats::repository::Query as StatsRepository;
use crate::service::stats::service::rows_to_bundles_with_meta;
use prost::Message;
use std::collections::HashSet;
use tonic::Status;

/// Common feed parameters needed for shared pagination logic in `finalize_fetch()`.
pub struct Params {
    pub limit: u64,
    pub cursor_filter: Option<CursorFilter>,
    pub omit_labels: Vec<String>,
}

impl Params {
    /// Extract values from the client request's page params and `omit_labels` set.
    pub fn from_req_params(
        params: &Option<PageParams>,
        omit_labels: Vec<String>,
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
                Some(CursorFilter::Backward(FeedCursor::decode(token)?))
            }
            Some((None, Some(token))) => {
                Some(CursorFilter::Forward(FeedCursor::decode(token)?))
            }
            _ => None,
        };

        Ok(Params {
            limit,
            cursor_filter,
            omit_labels,
        })
    }
}

pub struct Fetched {
    pub rows: Vec<EventWithContentRow>,
    pub page_info: PageInfo<FeedCursor>,
}

pub struct GetFeedResponseFilter {
    pub live_rows: Vec<EventWithContentRow>,
    pub tombstone_bundles: Vec<EventBundle>,
    pub page_info: PageInfo<FeedCursor>,
}

pub struct GetFeedResponseView {
    pub event_bundles: Vec<EventBundle>,
    pub event_hints: Vec<EventHint>,
    pub page_info: PageInfo<FeedCursor>,
}

/// Remove any extra rows (for checking next page existence) and extract page info.
/// Return the final fetch stage result.
pub fn finalize_fetch(
    mut rows: Vec<EventWithContentRow>,
    params: &Params,
) -> Fetched {
    // We tried fetching more rows than the client limit.
    // If we got more back, then there is more data past the page we will return.
    let has_extra_row = rows.len() as u64 > params.limit;

    // Simple heuristic: if a forward token was used, then there was a previous page.
    // Unless the forward token was a start token.
    // Similar logic applies for backward tokens.
    // There are false negatives when navigating forward from an
    // end token or backward from a start token.
    // We do not handle these cases.
    let mid_cursor_was_used = matches!(
        params.cursor_filter,
        Some(CursorFilter::Forward(FeedCursor::Mid(_)))
            | Some(CursorFilter::Backward(FeedCursor::Mid(_)))
    );

    let (has_previous_page, has_next_page) = match params.cursor_filter {
        Some(CursorFilter::Backward(_)) => {
            // Backwards queries have a cursor if there is a page following this one
            // and the extra row would be preceding the current page.
            (has_extra_row, mid_cursor_was_used)
        }
        _ => (mid_cursor_was_used, has_extra_row),
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

    let backward_marker = rows.first().map(|(event, _)| FeedMarker {
        created_at: event.created_at,
        id: event.id,
    });

    let forward_marker = rows.last().map(|(event, _)| FeedMarker {
        created_at: event.created_at,
        id: event.id,
    });

    let backward_cursor = match (backward_marker, &params.cursor_filter) {
        // We have non-zero rows: navigating backward will skip the first row we fetched.
        (Some(marker), _) => FeedCursor::Mid(marker),
        // There are zero rows preceding the previous cursor: we stay here.
        (None, Some(CursorFilter::Backward(cur))) => cur.clone(),
        // Truly empty feed: we are at the end and new items will be
        // placed preceding our cursor.
        // OR
        // Forward query from the end of the feed: we get the last items
        // if we navigate backward.
        _ => FeedCursor::End,
    };

    let forward_cursor = match (forward_marker, &params.cursor_filter) {
        // We have non-zero rows: navigating forward will skip the last row we fetched.
        (Some(marker), _) => FeedCursor::Mid(marker),
        // There are zero rows preceding the previous cursor: a forward query
        // should return the first items in the feed.
        (None, Some(CursorFilter::Backward(_))) => FeedCursor::Start,
        // There are zero rows following the previous cursor: we stay here.
        (None, Some(CursorFilter::Forward(cur))) => cur.clone(),
        // Truly empty feed: we are at the end and a forward query will continue
        // to return no items.
        _ => FeedCursor::End,
    };

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
    let identities = collect_identities(
        rows.iter()
            .map(|(event, content)| (event, content.as_ref())),
    );
    let (quote_keys, repost_keys) = collect_referenced_keys(rows);

    let quote_set = to_target_event_keys(&quote_keys);
    let repost_set = to_target_event_keys(&repost_keys);

    // Event keys for all referenced post events that may be displayed by the client.
    // Fetch labels and additional metadata for these.
    let display_keys: Vec<TargetEventKey> = {
        let mut set: HashSet<TargetEventKey> = keys.iter().cloned().collect();
        set.extend(quote_set.iter().cloned());
        set.extend(repost_set.iter().cloned());
        set.into_iter().collect()
    };

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
    let labels_fut = async {
        FeedsRepository::list_labels_for_event_keys(
            &ctx.db,
            &display_keys,
            ctx.trusted_moderator.as_deref(),
        )
        .await
        .map_err(map_db_err)
    };

    let reply_counts_fut = async {
        StatsRepository::count_replies(&ctx.db, display_keys.clone())
            .await
            .map_err(map_db_err)
    };

    let (
        deletes_by_target,
        identity_events,
        profile_events,
        referenced,
        label_events,
        reply_counts,
    ) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
        referenced_fut,
        labels_fut,
        reply_counts_fut,
    )?;

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
        label_events,
        reply_counts,
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
        label_events,
        reply_counts,
        ..
    } = hydration;

    let mut event_bundles = rows_to_bundles_with_meta(live_rows, &reply_counts);

    let mut label_bundles = rows_to_bundles(label_events);

    tokio::try_join!(
        attach_proofs(ctx, &mut event_bundles),
        attach_proofs(ctx, &mut tombstone_bundles),
        attach_proofs(ctx, &mut label_bundles),
    )?;

    // Identity, profile, referenced (quote / repost) posts, tombstones,
    // and moderation labels all ship as hints.
    let hint_rows: Vec<EventWithContentRow> = identity_events
        .into_iter()
        .chain(profile_events)
        .chain(quote_post_events)
        .chain(repost_events)
        .collect();

    let mut event_hints = rows_to_bundles_with_meta(hint_rows, &reply_counts)
        .into_iter()
        .map(|bundle| EventHint {
            event_bundle: Some(bundle),
        })
        .collect::<Vec<_>>();

    event_hints.extend(bundles_to_hints(tombstone_bundles));
    event_hints.extend(bundles_to_hints(label_bundles));

    Ok(GetFeedResponseView {
        event_bundles,
        event_hints,
        page_info,
    })
}
