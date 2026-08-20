use crate::data::PaginationParams;
use crate::data::hydration::HydrationState;
use crate::service::context::ServiceContext;
use crate::service::events::TargetEventKey;
use crate::service::events::tombstone;
use crate::service::feeds::repository::{self, EventWithContentRow};
use crate::service::feeds::rpc::common::{
    Referenced, has_matching_label, referenced_target2,
};
use crate::service::feeds::rpc::common::{
    to_target_event_key, to_target_event_keys,
};
use crate::service::identity::service::{bundles_to_hints, rows_to_bundles};
use crate::service::identity::service::{
    collect_identities, list_identity_events, list_profile_events,
    row_to_bundle,
};
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::{
    Content, EventBundle, EventHint, EventKey, PageParams, SearchResult,
};
use crate::service::stats::service::{
    EventStats, assemble_bundles, gather_stats_for, include_stats,
};
use entity::{content_model, event_model};
use polycentric_common::models::protos_v2::content::ContentBody;
use prost::Message;
use serde::Deserialize;
use std::collections::HashSet;
use tonic::Status;

pub use crate::data::{Cursor, CursorFilter, Marker, PageInfo};

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
        SortedBy: for<'a> Deserialize<'a>,
    {
        let query = prepare_search_query(&query)
            .ok_or_else(|| Status::invalid_argument("empty search query"))?;
        let PaginationParams {
            cursor_filter,
            limit,
        } = PaginationParams::from_req_params(params.as_ref())?;
        Ok(Params {
            query,
            limit: limit.into(),
            cursor_filter,
        })
    }
}

/// Construct a search query from a user defined `query` to use in
/// `search_query`.
fn prepare_search_query(search_query: &str) -> Option<String> {
    let search_query = search_query.trim();
    if search_query.is_empty() {
        return None;
    }

    // There is propably a more performant way we can do these query
    // transformations. But in most cases the query will be quite short, so it's
    // not really worth spending too much time on.
    // It's left as an "exercise to reader". ;)
    let mut result = String::with_capacity(search_query.len() * 2);
    let mut in_quote = false;
    for c in search_query.chars() {
        match c {
            '\"' => {
                in_quote = !in_quote;
                result.push(c);
            }
            c if c.is_whitespace()
                // Characters to escape, we convert them into whitespace.
                || matches!(c, ':' | '&' | '|' | '!' | '<' | '>' | '(' | ')') =>
            {
                // Ignore whitespace or to-be-escaped characters at the start.
                if result.is_empty() {
                    continue;
                }

                if in_quote {
                    // Words connected with `+` (followed by an operator) get the prefix
                    // matching (`:*`) applied to allow connected works, e.g.
                    // `New+York:*` becomes `'new':* <-> 'york':*`.
                    if !result.ends_with('+') {
                        result.push('+');
                    }
                } else {
                    // `:*` is for prefix matching of the word. `&` for "and" matching,
                    // i.e. match both search terms.
                    if !result.ends_with(":*&") {
                        result.push_str(":*&");
                    }
                }
            }
            c => result.push(c),
        }
    }
    // Remove last +/& as we don't need to join any more words.
    if result.ends_with('+') || result.ends_with('&') {
        result.pop();
    }
    if !result.ends_with(":*") && !result.is_empty() {
        result.push_str(":*");
    }
    Some(result)
}

#[test]
fn test_prepare_search_query() {
    let tests = [
        ("York", Some("York:*")),
        ("New York", Some("New:*&York:*")),
        ("\"New York\"", Some("\"New+York\":*")),
        ("\"New\" York", Some("\"New\":*&York:*")),
        ("New \"York\"", Some("New:*&\"York\":*")),
        ("\"New York", Some("\"New+York:*")),
        ("New York\"", Some("New:*&York\":*")),
        ("author:Sparrow", Some("author:*&Sparrow:*")),
        ("creator::Sparrow", Some("creator:*&Sparrow:*")),
        (
            "initialize_solana_accounts()",
            Some("initialize_solana_accounts:*"),
        ),
        ("openV<", Some("openV:*")),
        ("", None),
        (" ", None),
        ("  ", None),
        ("\t", None),
    ];

    for (input, expected) in tests {
        let got = prepare_search_query(input);
        assert_eq!(got.as_deref(), expected, "input: {input}");
    }
}

/// Event, content and search rank.
pub type SearchRow = (event_model::Model, content_model::Model, f32);

pub struct Fetched<SortedBy> {
    pub rows: Vec<SearchRow>,
    pub page_info: PageInfo<SortedBy>,
}

/// Returns all event keys references in `rows` as well as a set for the quoutes
/// and reports.
pub fn collect_referenced_keys(
    rows: &[SearchRow],
) -> (
    Vec<EventKey>,
    HashSet<TargetEventKey>,
    HashSet<TargetEventKey>,
) {
    let mut keys = Vec::with_capacity(rows.len());
    let mut push_key = |maybe_key: Option<EventKey>| {
        if let Some(key) = maybe_key {
            keys.push(key);
        }
    };

    let mut quote_set = HashSet::new();
    let mut repost_set = HashSet::new();
    for (_, content, _) in rows {
        let Ok(decoded) = Content::decode(content.serialized_bytes.as_slice())
        else {
            continue;
        };
        match decoded.content_body {
            Some(ContentBody::Post(post)) => {
                if let Some(key) = post.quote.as_ref()
                    && let Some(key) = to_target_event_key(key)
                {
                    quote_set.insert(key);
                }
                push_key(post.quote);
            }
            Some(ContentBody::Delete(delete)) => {
                push_key(delete.event_key);
            }
            Some(ContentBody::Reaction(reaction)) => {
                push_key(reaction.event_key);
            }
            Some(ContentBody::Repost(repost)) => {
                if let Some(key) = repost.post.as_ref()
                    && let Some(key) = to_target_event_key(key)
                {
                    repost_set.insert(key);
                }
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
            | Some(ContentBody::AttributedToReaction(_))
            | None => {}
        }
    }
    (keys, quote_set, repost_set)
}

pub struct SearchResponseFilter<SortedBy> {
    pub live_rows: Vec<SearchRow>,
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
        rows.iter().map(|(e, _, _)| TargetEventKey::of(e)).collect();
    let identities = collect_identities(
        rows.iter()
            .map(|(event, content, _)| (event, Some(content))),
    );
    let (ref_keys, quote_set, repost_set) = collect_referenced_keys(rows);
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
    let referenced_fut = async {
        repository::Query::list_events_by_keys(&ctx.db, &ref_keys)
            .await
            .map_err(|err| {
                tracing::warn!("failed to list events: {err}");
                Status::internal("internal server error")
            })
    };
    let labels_fut = async {
        repository::Query::list_labels_for_event_keys(
            &ctx.db,
            &display_keys,
            ctx.trusted_moderator.as_deref(),
        )
        .await
        .map_err(|err| {
            tracing::warn!("failed to list labels: {err}");
            Status::internal("internal server error")
        })
    };

    let stats_fut = async {
        gather_stats_for(&ctx.db, &display_keys)
            .await
            .map_err(|err| {
                tracing::warn!("failed to gather stats: {err}");
                Status::internal("internal server error")
            })
    };

    let (
        deletes_by_target,
        identity_events,
        profile_events,
        referenced,
        label_events,
        stats,
    ) = tokio::try_join!(
        tombstones_fut,
        identity_events_fut,
        profile_events_fut,
        referenced_fut,
        labels_fut,
        stats_fut,
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
        stats,
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

    let mut live_rows: Vec<SearchRow> = Vec::with_capacity(rows.len());
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

        match referenced_target2(&row.1) {
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

    let mut results = assemble_results(live_rows, &stats);
    // SAFETY: we've just assembled the result above where the event_bundle is
    // always Some, hence it's safe to unwrap.
    let results_iter = results
        .iter_mut()
        .map(|result| result.event_bundle.as_mut().unwrap());

    let mut label_bundles = rows_to_bundles(label_events);

    tokio::try_join!(
        attach_proofs(ctx, results_iter),
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
        results,
        event_hints,
        page_info,
    })
}

/// Create event bundles with metadata.
pub fn assemble_results(
    rows: Vec<SearchRow>,
    stats: &EventStats,
) -> Vec<SearchResult> {
    rows.into_iter()
        .map(|(event, content, rank)| {
            let key = TargetEventKey::of(&event);
            let mut event = row_to_bundle((event, Some(content)));
            include_stats(&mut event.meta, &key, stats);
            SearchResult {
                event_bundle: Some(event),
                rank,
            }
        })
        .collect::<Vec<_>>()
}

pub struct SearchResponseView<SortedBy> {
    pub results: Vec<SearchResult>,
    pub event_hints: Vec<EventHint>,
    pub page_info: PageInfo<SortedBy>,
}
