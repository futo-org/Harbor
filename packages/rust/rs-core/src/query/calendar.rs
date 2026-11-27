//! Calendar service queries

use std::cmp::Reverse;
use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    CalendarEventBundle, CalendarEventStats, Content, EventBundle, EventHint,
    GetCalendarEventRequest, GetCalendarEventResponse, ListCalendarEventAttendeesRequest,
    ListCalendarEventAttendeesResponse, ListCalendarEventsFilters, ListCalendarEventsRequest,
    ListCalendarEventsResponse, PageInfo, PageParams, SearchCalendarEventsRequest,
    SearchCalendarEventsResponse, calendar_service_client::CalendarServiceClient, content,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::lock::LockRecover;
use crate::query::blocks::{is_blocked_bundle, retain_unblocked_hints};
use crate::query::event::key::EventKey;
use crate::query::event::merge::{
    EventDedupKey, bundle_created_at, copy_hints, decode_event, event_dedup_key, merge_bundle,
    merge_event_bundles, merge_event_hints,
};
use crate::query::pagination::{FakeCursorToken, merge_page_info, prepare_page_info};
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListCalendarEventsArgs {
    /// Only events this identity created or is hosting
    pub identity: Option<String>,
    /// Only events this identity has been asked to host and hasn't answered
    pub awaiting_host: Option<String>,
    /// Only events that finish at or after this time, in ms
    pub ends_after: Option<u64>,
    /// Only events that finish before this time, in ms
    pub ends_before: Option<u64>,
    /// Latest first. Soonest first if not set
    pub latest_first: bool,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetCalendarEventArgs {
    pub event_key: EventKey,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListCalendarEventAttendeesArgs {
    pub event_key: EventKey,
    /// Filter by `CalendarEventRsvpStatus`
    pub status: Option<i32>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct SearchCalendarEventsArgs {
    pub query: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
}

/// Responses with calendar events, hints and page info
trait CalendarEventsResponse: Message + Default {
    fn events_mut(&mut self) -> &mut Vec<CalendarEventBundle>;
    fn hints_mut(&mut self) -> &mut Vec<EventHint>;
    fn page_info_mut(&mut self) -> &mut Option<PageInfo>;
}

impl CalendarEventsResponse for ListCalendarEventsResponse {
    fn events_mut(&mut self) -> &mut Vec<CalendarEventBundle> {
        &mut self.events
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
    fn page_info_mut(&mut self) -> &mut Option<PageInfo> {
        &mut self.page_info
    }
}

impl CalendarEventsResponse for SearchCalendarEventsResponse {
    fn events_mut(&mut self) -> &mut Vec<CalendarEventBundle> {
        &mut self.events
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
    fn page_info_mut(&mut self) -> &mut Option<PageInfo> {
        &mut self.page_info
    }
}

/// Servers only count the RSVPs they've seen, so take the highest
fn merge_stats(
    left: Option<CalendarEventStats>,
    right: Option<CalendarEventStats>,
) -> Option<CalendarEventStats> {
    match (left, right) {
        (Some(l), Some(r)) => Some(CalendarEventStats {
            going_count: l.going_count.max(r.going_count),
            maybe_count: l.maybe_count.max(r.maybe_count),
            not_going_count: l.not_going_count.max(r.not_going_count),
        }),
        (l, r) => l.or(r),
    }
}

/// Merge the same event from two servers
fn merge_calendar_event(
    left: CalendarEventBundle,
    right: CalendarEventBundle,
) -> CalendarEventBundle {
    let event_bundle = match (left.event_bundle, right.event_bundle) {
        (Some(l), Some(r)) => Some(merge_bundle(l, r)),
        (l, r) => l.or(r),
    };
    let mut confirmed_hosts = left.confirmed_hosts;
    for host in right.confirmed_hosts {
        if !confirmed_hosts.contains(&host) {
            confirmed_hosts.push(host);
        }
    }
    CalendarEventBundle {
        event_bundle,
        stats: merge_stats(left.stats, right.stats),
        confirmed_hosts,
    }
}

/// Dedupe by event key and drop invalid or blocked events
fn merge_calendar_events(client: &PolycentricClient, events: &mut Vec<CalendarEventBundle>) {
    let mut merged: Vec<CalendarEventBundle> = Vec::with_capacity(events.len());
    let mut index: HashMap<EventDedupKey, usize> = HashMap::new();
    for event in events.drain(..) {
        let Some(key) = event.event_bundle.as_ref().and_then(event_dedup_key) else {
            continue;
        };
        match index.entry(key) {
            Entry::Occupied(entry) => {
                let existing = std::mem::take(&mut merged[*entry.get()]);
                merged[*entry.get()] = merge_calendar_event(existing, event);
            }
            Entry::Vacant(entry) => {
                entry.insert(merged.len());
                merged.push(event);
            }
        }
    }

    let blocked = client.blocked_identities();
    merged.retain(|event| {
        let Some(bundle) = event.event_bundle.as_ref() else {
            return false;
        };
        let valid = bundle
            .signed_event
            .as_ref()
            .is_some_and(|se| client.validate_event(se, &bundle.event_proofs).is_ok());
        valid && !is_blocked_bundle(&blocked, bundle)
    });
    *events = merged;
}

/// Event start, in ms
fn start_at(event: &CalendarEventBundle) -> Option<u64> {
    let content_bytes = &event
        .event_bundle
        .as_ref()?
        .serialized_content
        .as_ref()?
        .content_bytes;
    match Content::decode(content_bytes.as_slice())
        .ok()?
        .content_body?
    {
        content::ContentBody::CalendarEvent(event) => Some(event.start_at),
        _ => None,
    }
}

/// Merge the events from each server, then sort
fn merge_events_responses<T: CalendarEventsResponse>(
    values: &[Vec<u8>],
    client: &Arc<Mutex<PolycentricClient>>,
    sort: impl Fn(&mut [CalendarEventBundle]),
) -> Vec<u8> {
    let mut merged = T::default();
    for v in values {
        if let Ok(mut incoming) = T::decode(v.as_slice()) {
            merged.events_mut().append(incoming.events_mut());
            merged.hints_mut().append(incoming.hints_mut());
            *merged.page_info_mut() = merge_page_info(
                merged.page_info_mut().take(),
                incoming.page_info_mut().take(),
            );
        }
    }

    merge_event_hints(merged.hints_mut());
    {
        let c = client.lock_recover();
        merge_calendar_events(&c, merged.events_mut());
        retain_validated_hints(&c, merged.hints_mut());
        retain_unblocked_hints(&c.blocked_identities(), merged.hints_mut());
    }
    sort(merged.events_mut());

    merged.encode_to_vec()
}

/// Copy the events into the local store
fn copy_calendar_events(client: &Arc<Mutex<PolycentricClient>>, events: &[CalendarEventBundle]) {
    let bundles: Vec<EventBundle> = events
        .iter()
        .filter_map(|event| event.event_bundle.clone())
        .collect();
    if !bundles.is_empty() {
        client.lock_recover().copy_bundles(bundles);
    }
}

/// List calendar events
pub fn list_calendar_events(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListCalendarEventsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListCalendarEventsArgs {
        identity,
        awaiting_host,
        ends_after,
        ends_before,
        latest_first,
        limit,
        backward_token,
        forward_token,
    } = args;
    let filters = ListCalendarEventsFilters {
        identity,
        awaiting_host,
        ends_after,
        ends_before,
    };
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let filters = filters.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = CalendarServiceClient::new(channel(&server_url).await?)
                .list_calendar_events(ListCalendarEventsRequest {
                    filters: Some(filters),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    latest_first,
                })
                .await
                .map_err(|e| format!("list_calendar_events [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            copy_calendar_events(&client, &response.events);
            Ok(bytes)
        }
    };

    let merge_fn = move |values: &[Vec<u8>],
                         _previous: Option<&Vec<u8>>,
                         client: &Arc<Mutex<PolycentricClient>>| {
        merge_events_responses::<ListCalendarEventsResponse>(values, client, |events| {
            if latest_first {
                events.sort_by_cached_key(|event| Reverse(start_at(event)));
            } else {
                events.sort_by_cached_key(start_at);
            }
        })
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}

/// Search calendar events
pub fn search_calendar_events(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: SearchCalendarEventsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let SearchCalendarEventsArgs {
        query,
        limit,
        backward_token,
        forward_token,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let query = query.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = CalendarServiceClient::new(channel(&server_url).await?)
                .search_calendar_events(SearchCalendarEventsRequest {
                    query,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                })
                .await
                .map_err(|e| format!("search_calendar_events [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            copy_calendar_events(&client, &response.events);
            Ok(bytes)
        }
    };

    let merge_fn = move |values: &[Vec<u8>],
                         _previous: Option<&Vec<u8>>,
                         client: &Arc<Mutex<PolycentricClient>>| {
        // Keep each server's ranking
        merge_events_responses::<SearchCalendarEventsResponse>(values, client, |_| {})
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}

/// Get a calendar event with its stats
pub fn get_calendar_event(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetCalendarEventArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let request = GetCalendarEventRequest {
        event_key: Some(args.event_key.into()),
    };
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = CalendarServiceClient::new(channel(&server_url).await?)
                .get_calendar_event(request)
                .await
                .map_err(|e| format!("get_calendar_event [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            copy_calendar_events(&client, response.event.as_slice());
            Ok(bytes)
        }
    };

    let merge_fn = move |values: &[Vec<u8>],
                         _previous: Option<&Vec<u8>>,
                         client: &Arc<Mutex<PolycentricClient>>| {
        let mut events = Vec::new();
        let mut hints = Vec::new();
        for v in values {
            if let Ok(mut incoming) = GetCalendarEventResponse::decode(v.as_slice()) {
                events.extend(incoming.event.take());
                hints.append(&mut incoming.event_hints);
            }
        }

        merge_event_hints(&mut hints);
        {
            let c = client.lock_recover();
            merge_calendar_events(&c, &mut events);
            retain_validated_hints(&c, &mut hints);
            retain_unblocked_hints(&c.blocked_identities(), &mut hints);
        }

        GetCalendarEventResponse {
            event: events.into_iter().next(),
            event_hints: hints,
        }
        .encode_to_vec()
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}

/// List the RSVPs for a calendar event. One per identity
pub fn list_calendar_event_attendees(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListCalendarEventAttendeesArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListCalendarEventAttendeesArgs {
        event_key,
        status,
        limit,
        backward_token,
        forward_token,
    } = args;
    let event_key: polycentric_common::models::protos_v2::EventKey = event_key.into();
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let event_key = event_key.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = CalendarServiceClient::new(channel(&server_url).await?)
                .list_calendar_event_attendees(ListCalendarEventAttendeesRequest {
                    event_key: Some(event_key),
                    status,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                })
                .await
                .map_err(|e| format!("list_calendar_event_attendees [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock_recover().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    let merge_fn = move |values: &[Vec<u8>],
                         _previous: Option<&Vec<u8>>,
                         client: &Arc<Mutex<PolycentricClient>>| {
        let mut merged = ListCalendarEventAttendeesResponse::default();
        for v in values {
            if let Ok(mut incoming) = ListCalendarEventAttendeesResponse::decode(v.as_slice()) {
                merged.event_bundles.append(&mut incoming.event_bundles);
                merged.event_hints.append(&mut incoming.event_hints);
                merged.page_info =
                    merge_page_info(merged.page_info.take(), incoming.page_info.take());
            }
        }

        merge_event_bundles(&mut merged.event_bundles);
        merge_event_hints(&mut merged.event_hints);
        {
            let c = client.lock_recover();
            retain_validated_bundles(&c, &mut merged.event_bundles);
            retain_validated_hints(&c, &mut merged.event_hints);

            let blocked = c.blocked_identities();
            merged
                .event_bundles
                .retain(|bundle| !is_blocked_bundle(&blocked, bundle));
            retain_unblocked_hints(&blocked, &mut merged.event_hints);
        }

        // Newest first, one per identity. Servers can be behind
        merged
            .event_bundles
            .sort_by_cached_key(|bundle| Reverse(bundle_created_at(bundle)));
        let mut answered = std::collections::HashSet::new();
        merged.event_bundles.retain(|bundle| {
            decode_event(bundle)
                .and_then(|event| event.key)
                .is_some_and(|key| answered.insert(key.identity))
        });

        merged.encode_to_vec()
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}
