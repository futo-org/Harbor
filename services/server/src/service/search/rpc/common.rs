use crate::data::hydration::HydrationState;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone;
use crate::service::feeds::repository::EventWithContentRow;
use crate::service::feeds::rpc::common::to_target_event_keys;
use crate::service::feeds::rpc::common::{
    Referenced, has_matching_label, referenced_target,
};
use crate::service::feeds::util::PageCursor;
use crate::service::identity::service::{bundles_to_hints, rows_to_bundles};
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
};
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{
    self, Content, EventBundle, EventHint, EventKey, PageParams,
};
use crate::service::stats::service::EventStats;
use crate::service::stats::service::assemble_bundles;
use polycentric_common::models::protos_v2::content::ContentBody;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tonic::Status;

// TODO: dedup with the logic in `src/service/feeds/rpc/common.rs`, a lot of it
// is the same, but the types are slightly different. We could unify it and move
// it to the data/pipeline module.

pub struct Params<SortedBy> {
    pub query: String,
    pub limit: u64,
    pub cursor_filter: Option<CursorFilter<SortedBy>>,
}

impl<SortedBy> Params<SortedBy> {
    pub fn from_req_params(
        query: String,
        params: &Option<PageParams>,
    ) -> Result<Params<SortedBy>, Status>
    where
        Cursor<SortedBy>: PageCursor,
    {
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
                Some(CursorFilter::Backward(Cursor::decode(token)?))
            }
            Some((None, Some(token))) => {
                Some(CursorFilter::Forward(Cursor::decode(token)?))
            }
            _ => None,
        };

        Ok(Params {
            query,
            limit,
            cursor_filter,
        })
    }
}

pub fn page_limit(page_params: &Option<PageParams>) -> u64 {
    page_params
        .as_ref()
        .and_then(|p| p.limit)
        .unwrap_or(50)
        .clamp(1, 200) as u64
}

pub struct Fetched<SortedBy> {
    pub rows: Vec<EventWithContentRow>,
    pub page_info: PageInfo<SortedBy>,
}

/// Remove any extra rows (for checking next page existence) and extract page info.
/// Return the final fetch stage result.
pub fn finalize_fetch<E, F, SortedBy>(
    rows: &mut Vec<E>,
    params: &Params<SortedBy>,
    row_to_marker: F,
) -> PageInfo<SortedBy>
where
    F: Fn(&E) -> Marker<SortedBy>,
    SortedBy: Clone,
{
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
        Some(CursorFilter::Forward(Cursor::Mid(_)))
            | Some(CursorFilter::Backward(Cursor::Mid(_)))
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

    let backward_marker = rows.first().map(&row_to_marker);
    let forward_marker = rows.last().map(&row_to_marker);

    let backward_cursor = match (backward_marker, &params.cursor_filter) {
        // We have non-zero rows: navigating backward will skip the first row we fetched.
        (Some(marker), _) => Cursor::Mid(marker),
        // There are zero rows preceding the previous cursor: we stay here.
        (None, Some(CursorFilter::Backward(cur))) => cur.clone(),
        // Truly empty feed: we are at the end and new items will be
        // placed preceding our cursor.
        // OR
        // Forward query from the end of the feed: we get the last items
        // if we navigate backward.
        _ => Cursor::End,
    };

    let forward_cursor = match (forward_marker, &params.cursor_filter) {
        // We have non-zero rows: navigating forward will skip the last row we fetched.
        (Some(marker), _) => Cursor::Mid(marker),
        // There are zero rows preceding the previous cursor: a forward query
        // should return the first items in the feed.
        (None, Some(CursorFilter::Backward(_))) => Cursor::Start,
        // There are zero rows following the previous cursor: we stay here.
        (None, Some(CursorFilter::Forward(cur))) => cur.clone(),
        // Truly empty feed: we are at the end and a forward query will continue
        // to return no items.
        _ => Cursor::End,
    };

    PageInfo {
        backward_cursor,
        forward_cursor,
        has_previous_page,
        has_next_page,
    }
}

pub fn collect_referenced_keys(rows: &[EventWithContentRow]) -> Vec<EventKey> {
    let mut keys = Vec::with_capacity(rows.len());
    let mut push_key = |maybe_key: Option<EventKey>| {
        if let Some(key) = maybe_key {
            keys.push(key);
        }
    };
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
                push_key(post.quote);
            }
            Some(ContentBody::Delete(delete)) => {
                push_key(delete.event_key);
            }
            Some(ContentBody::Reaction(reaction)) => {
                push_key(reaction.event_key);
            }
            Some(ContentBody::Repost(repost)) => {
                push_key(repost.post);
            }
            Some(ContentBody::Report(report)) => {
                push_key(report.event_key);
            }
            Some(ContentBody::Labels(labels)) => {
                push_key(labels.event_key);
            }
            Some(ContentBody::VerificationVerify(verify)) => {
                push_key(verify.claim_event_key);
            }
            Some(ContentBody::VerificationTarget(target)) => {
                push_key(target.claim_event_key);
            }
            // Don't have event keys.
            Some(ContentBody::Follow(_))
            | Some(ContentBody::Block(_))
            | Some(ContentBody::ProfileUpdate(_))
            | Some(ContentBody::Identity(_))
            | Some(ContentBody::VerificationClaim(_))
            | None => {}
        }
    }
    keys
}

pub struct SearchResponseFilter<SortedBy> {
    pub live_rows: Vec<EventWithContentRow>,
    pub tombstone_bundles: Vec<EventBundle>,
    pub event_hints: Vec<EventWithContentRow>,
    pub page_info: PageInfo<SortedBy>,
}

pub async fn hydrate<SortedBy>(
    ctx: &ServiceContext,
    fetched: &Fetched<SortedBy>,
) -> Result<HydrationState, Status> {
    let rows = &fetched.rows;

    let keys: Vec<TargetEventKey> =
        rows.iter().map(|(e, _)| TargetEventKey::of(e)).collect();
    let identities = collect_identities(
        rows.iter()
            .map(|(event, content)| (event, content.as_ref())),
    );
    let ref_keys = collect_referenced_keys(rows);
    let mut target_event_keys = to_target_event_keys(&ref_keys);

    // Event keys for all referenced post events that may be displayed by the client.
    // Fetch labels and additional metadata for these.
    let display_keys: Vec<TargetEventKey> = {
        target_event_keys.extend(keys);
        target_event_keys.into_iter().collect()
    };

    let tombstones_fut = tombstone::validated_tombstones(ctx, &display_keys);
    let identity_events_fut = list_identity_events(ctx, identities.clone());
    let profile_events_fut = list_profile_events(ctx, identities);

    let (deletes_by_target, identity_events, profile_events) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
    )?;

    Ok(HydrationState {
        deletes_by_target,
        identity_events,
        profile_events,
        // Unused in searching of users.
        quote_post_events: Vec::new(),
        repost_events: Vec::new(),
        label_events: Vec::new(),
        stats: EventStats::none(),
    })
}

/// Remove rows that are tombstoned, omit-labeled, or whose indirect
/// targets (quote/repost) are tombstoned or omit-labeled. Hint rows
/// (referenced posts) are filtered alongside live rows.
pub async fn filter<SortedBy>(
    fetched: Fetched<SortedBy>,
    hydration: &HydrationState,
    omit_labels: &[String],
) -> Result<SearchResponseFilter<SortedBy>, Status> {
    let Fetched { rows, page_info } = fetched;
    let omit_set: HashSet<&str> =
        omit_labels.iter().map(|s| s.as_str()).collect();

    let is_omitted = |key: &TargetEventKey| -> bool {
        hydration.deletes_by_target.contains_key(key)
            || (!omit_set.is_empty()
                && has_matching_label(&hydration.label_events, key, &omit_set))
    };

    let mut live_rows: Vec<EventWithContentRow> =
        Vec::with_capacity(rows.len());
    let mut tombstone_bundles: Vec<EventBundle> = Vec::new();

    // Filter live rows
    for row in rows {
        let key = TargetEventKey::of(&row.0);

        // If tombstoned, drop but add a hint
        if let Some(bundles) = hydration.deletes_by_target.get(&key) {
            tombstone_bundles.extend(bundles.iter().cloned());
            continue;
        }

        // If omit-labeled, drop
        if !omit_set.is_empty()
            && has_matching_label(&hydration.label_events, &key, &omit_set)
        {
            continue;
        }

        match referenced_target(&row) {
            // If repost of deleted/omitted target, drop
            Some(Referenced::Repost(target)) if is_omitted(&target) => {
                continue;
            }
            // If quote of deleted/omitted target, allow and bring tombstone bundle if it exists
            Some(Referenced::Quote(target)) => {
                if let Some(bundles) = hydration.deletes_by_target.get(&target)
                {
                    tombstone_bundles.extend(bundles.iter().cloned());
                }
            }
            _ => {}
        }

        live_rows.push(row);
    }

    // Filter hint rows
    let event_hints: Vec<EventWithContentRow> = hydration
        .quote_post_events
        .iter()
        .chain(hydration.repost_events.iter())
        .filter(|row| {
            let key = TargetEventKey::of(&row.0);
            !is_omitted(&key)
        })
        .cloned()
        .collect();

    Ok(SearchResponseFilter {
        live_rows,
        tombstone_bundles,
        event_hints,
        page_info,
    })
}

/// Build bundles from live rows, attach revocation proofs, and merge
/// identity, profile and tombstone hints.
pub async fn view<SortedBy>(
    ctx: &ServiceContext,
    filtered: SearchResponseFilter<SortedBy>,
    hydration: HydrationState,
) -> Result<SearchResponseView<SortedBy>, Status> {
    let SearchResponseFilter {
        live_rows,
        mut tombstone_bundles,
        event_hints,
        page_info,
    } = filtered;
    let HydrationState {
        identity_events,
        profile_events,
        label_events,
        stats,
        ..
    } = hydration;

    let mut event_bundles = assemble_bundles(live_rows, &stats);

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
        .chain(event_hints)
        .collect();

    let mut event_hints = assemble_bundles(hint_rows, &stats)
        .into_iter()
        .map(|bundle| EventHint {
            event_bundle: Some(bundle),
        })
        .collect::<Vec<_>>();

    event_hints.extend(bundles_to_hints(tombstone_bundles));
    event_hints.extend(bundles_to_hints(label_bundles));

    Ok(SearchResponseView {
        event_bundles,
        event_hints,
        page_info,
    })
}

pub struct SearchResponseView<SortedBy> {
    pub event_bundles: Vec<EventBundle>,
    pub event_hints: Vec<EventHint>,
    pub page_info: PageInfo<SortedBy>,
}

/// `PageInfo` to return to the client, except with our types
/// instead of opaque cursor strings.
#[derive(Debug)]
pub struct PageInfo<SortedBy> {
    pub backward_cursor: Cursor<SortedBy>,
    pub forward_cursor: Cursor<SortedBy>,
    pub has_previous_page: bool,
    pub has_next_page: bool,
}

impl<SortedBy> PageInfo<SortedBy> {
    /// Build the final `PageInfo` protobuf message to give the client.
    pub fn proto(&self) -> Result<proto::PageInfo, Status>
    where
        Cursor<SortedBy>: PageCursor,
    {
        let start_cursor = self.backward_cursor.encode()?;
        let end_cursor = self.forward_cursor.encode()?;

        Ok(proto::PageInfo {
            start_cursor,
            end_cursor,
            has_previous_page: self.has_previous_page,
            has_next_page: self.has_next_page,
        })
    }
}

/// Retrieve items in the feed relative to a cursor.
#[derive(Debug)]
pub enum CursorFilter<SortedBy> {
    Forward(Cursor<SortedBy>),
    Backward(Cursor<SortedBy>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Cursor<SortedBy> {
    /// Marks the start of the feed.
    /// Forward queries return the first items and backward queries return nothing.
    Start,
    /// Marks somewhere in the feed.
    /// Forward queries return items following this point and
    /// backward queries return items preceding this point.
    Mid(Marker<SortedBy>),
    /// Marks the end of the feed.
    /// Forward queries return nothing and backward queries return the last items.
    End,
}

impl<SortedBy> PageCursor for Cursor<SortedBy> where
    SortedBy: Serialize + for<'a> Deserialize<'a>
{
}

/// Exclusive lowerbound/upperbound for a feed query
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Marker<SortedBy> {
    pub sorted_by: SortedBy,
    pub id: i64,
}
