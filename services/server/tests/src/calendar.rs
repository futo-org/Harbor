//! Tests for the calendar service.

use tonic::Code;

use crate::*;

/// Keys of the events, in order
fn event_keys(bundles: &[CalendarEventBundle]) -> Vec<EventKey> {
    bundles
        .iter()
        .map(|bundle| bundle_key(bundle.event_bundle.as_ref().unwrap()))
        .collect()
}

fn bundle_key(bundle: &EventBundle) -> EventKey {
    let signed_event = bundle.signed_event.as_ref().unwrap();
    Event::decode(&*signed_event.event_bytes)
        .unwrap()
        .key
        .unwrap()
}

/// (going, maybe, not going)
pub(crate) fn counts(bundle: &CalendarEventBundle) -> (i64, i64, i64) {
    let stats = bundle.stats.as_ref().unwrap();
    (stats.going_count, stats.maybe_count, stats.not_going_count)
}

async fn list_events(
    filters: ListCalendarEventsFilters,
    latest_first: bool,
    page_params: Option<PageParams>,
) -> ListCalendarEventsResponse {
    calendar_service()
        .await
        .list_calendar_events(ListCalendarEventsRequest {
            filters: Some(filters),
            page_params,
            latest_first,
        })
        .await
        .unwrap()
        .into_inner()
}

/// The event with its stats, or the error if it can't be read
pub(crate) async fn get_event(
    event_key: &EventKey,
) -> Result<CalendarEventBundle, tonic::Status> {
    let response = calendar_service()
        .await
        .get_calendar_event(GetCalendarEventRequest {
            event_key: Some(event_key.clone()),
        })
        .await?;
    Ok(response.into_inner().event.unwrap())
}

/// Events the identity created or hosts that haven't finished, soonest first
async fn upcoming(
    identity: &str,
    page_params: Option<PageParams>,
) -> ListCalendarEventsResponse {
    let filters = ListCalendarEventsFilters {
        identity: Some(identity.to_owned()),
        ends_after: Some(current_timestamp()),
        ..Default::default()
    };
    list_events(filters, false, page_params).await
}

/// Events the identity has been asked to host and hasn't answered
async fn awaiting_host(identity: &str) -> Vec<EventKey> {
    let filters = ListCalendarEventsFilters {
        awaiting_host: Some(identity.to_owned()),
        ..Default::default()
    };
    event_keys(&list_events(filters, false, None).await.events)
}

pub(crate) async fn list_attendees(
    event_key: &EventKey,
    status: Option<CalendarEventRsvpStatus>,
) -> Vec<String> {
    calendar_service()
        .await
        .list_calendar_event_attendees(ListCalendarEventAttendeesRequest {
            event_key: Some(event_key.clone()),
            status: status.map(|status| status as i32),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner()
        .event_bundles
        .iter()
        .map(|bundle| bundle_key(bundle).identity)
        .collect()
}

#[tokio::test]
async fn list_calendar_events_upcoming_and_past() {
    let mut host = TestClient::new().await;
    host.calendar_event_titled("Tomorrow", 24, current_timestamp());
    let tomorrow = host.get_last_event_key();
    host.calendar_event_titled("Next week", 24 * 7, current_timestamp());
    let next_week = host.get_last_event_key();
    host.calendar_event_titled("Yesterday", -24, current_timestamp());
    let yesterday = host.get_last_event_key();
    host.calendar_event_titled("Last week", -24 * 7, current_timestamp());
    let last_week = host.get_last_event_key();
    host.submit_events().await;

    // Soonest first
    let upcoming = upcoming(host.identity(), None).await;
    assert_eq!(event_keys(&upcoming.events), [tomorrow, next_week]);

    // Latest first
    let filters = ListCalendarEventsFilters {
        identity: Some(host.identity().to_owned()),
        ends_before: Some(current_timestamp()),
        ..Default::default()
    };
    let past = list_events(filters, true, None).await;
    assert_eq!(event_keys(&past.events), [yesterday, last_week]);
}

#[tokio::test]
async fn list_calendar_events_pagination() {
    let mut host = TestClient::new().await;
    host.calendar_event_titled("First", 24, current_timestamp());
    let first = host.get_last_event_key();
    host.calendar_event_titled("Second", 48, current_timestamp());
    let second = host.get_last_event_key();
    host.submit_events().await;

    let limit_one = |forward_token| {
        Some(PageParams {
            limit: Some(1),
            backward_token: None,
            forward_token,
        })
    };
    let page = upcoming(host.identity(), limit_one(None)).await;
    assert_eq!(event_keys(&page.events), [first.clone()]);
    let page_info = page.page_info.unwrap();
    assert!(page_info.has_next_page);

    let page =
        upcoming(host.identity(), limit_one(Some(page_info.end_cursor))).await;
    assert_eq!(event_keys(&page.events), [second]);
    let page_info = page.page_info.unwrap();
    assert!(!page_info.has_next_page);

    // And back again
    let back = Some(PageParams {
        limit: Some(1),
        backward_token: Some(page_info.start_cursor),
        forward_token: None,
    });
    let page = upcoming(host.identity(), back).await;
    assert_eq!(event_keys(&page.events), [first]);
}

#[tokio::test]
async fn calendar_event_rsvp_counts() {
    let mut host = TestClient::new().await;
    host.calendar_event_titled("Meetup", 24, current_timestamp());
    let event_key = host.get_last_event_key();
    host.submit_events().await;

    let mut going = TestClient::new().await;
    going.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Going,
        current_timestamp(),
    );
    going.submit_events().await;

    // Changes their answer. Clients delete the old one first
    let mut changed = TestClient::new().await;
    changed.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Maybe,
        current_timestamp(),
    );
    let first_answer = changed.get_last_event_key();
    changed.delete_key(first_answer, current_timestamp() + 1);
    changed.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::NotGoing,
        current_timestamp() + 2,
    );
    changed.submit_events().await;

    // Withdraws their answer
    let mut withdrew = TestClient::new().await;
    withdrew.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Going,
        current_timestamp(),
    );
    let answer = withdrew.get_last_event_key();
    withdrew.delete_key(answer, current_timestamp() + 1);
    withdrew.submit_events().await;

    let response = calendar_service()
        .await
        .get_calendar_event(GetCalendarEventRequest {
            event_key: Some(event_key.clone()),
        })
        .await
        .unwrap()
        .into_inner();
    let event = response.event.unwrap();
    assert_eq!(
        event_keys(std::slice::from_ref(&event)),
        std::slice::from_ref(&event_key),
    );
    assert_eq!(counts(&event), (1, 0, 1));

    let mut everyone = list_attendees(&event_key, None).await;
    everyone.sort();
    let mut expected =
        vec![going.identity().to_owned(), changed.identity().to_owned()];
    expected.sort();
    assert_eq!(everyone, expected);

    assert_eq!(
        list_attendees(&event_key, Some(CalendarEventRsvpStatus::Going)).await,
        [going.identity()],
    );
    assert_eq!(
        list_attendees(&event_key, Some(CalendarEventRsvpStatus::Maybe)).await,
        Vec::<String>::new(),
    );

    // Counts are on the list too
    let listed = upcoming(host.identity(), None).await;
    assert_eq!(counts(&listed.events[0]), (1, 0, 1));
}

#[tokio::test]
async fn calendar_event_deleted() {
    let mut host = TestClient::new().await;
    host.calendar_event_titled("Cancelled", 24, current_timestamp());
    let event_key = host.get_last_event_key();
    host.delete_key(event_key.clone(), current_timestamp() + 1);
    host.submit_events().await;

    let upcoming = upcoming(host.identity(), None).await;
    assert_eq!(event_keys(&upcoming.events), []);

    let status = calendar_service()
        .await
        .get_calendar_event(GetCalendarEventRequest {
            event_key: Some(event_key),
        })
        .await
        .unwrap_err();
    assert_eq!(status.code(), Code::NotFound);
}

#[tokio::test]
async fn search_calendar_events() {
    let word = random_unstemmed_string();

    let mut host = TestClient::new().await;
    host.calendar_event_titled(
        &format!("The {word} gathering"),
        24,
        current_timestamp(),
    );
    let event_key = host.get_last_event_key();
    host.calendar_event_titled("Something else", 24, current_timestamp());
    host.submit_events().await;

    let response = calendar_service()
        .await
        .search_calendar_events(SearchCalendarEventsRequest {
            query: word,
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(event_keys(&response.events), [event_key]);

    let status = calendar_service()
        .await
        .search_calendar_events(SearchCalendarEventsRequest {
            query: "  ".to_owned(),
            page_params: None,
        })
        .await
        .unwrap_err();
    assert_eq!(status.code(), Code::InvalidArgument);
}

#[tokio::test]
async fn calendar_event_hosts() {
    let mut creator = TestClient::new().await;
    let mut named = TestClient::new().await;
    let mut declines = TestClient::new().await;
    let mut unnamed = TestClient::new().await;

    creator.calendar_event(
        CalendarEvent {
            id: random_string(),
            title: "Hosted by someone else".to_owned(),
            description: None,
            start_at: current_timestamp() + 60 * 60 * 1000,
            end_at: None,
            location: None,
            labels: Vec::new(),
            all_day: false,
            image: None,
            timezone: None,
            hosts: vec![
                named.identity().to_owned(),
                declines.identity().to_owned(),
            ],
        },
        current_timestamp(),
    );
    let event_key = creator.get_last_event_key();
    creator.submit_events().await;

    let get = || async {
        calendar_service()
            .await
            .get_calendar_event(GetCalendarEventRequest {
                event_key: Some(event_key.clone()),
            })
            .await
            .unwrap()
            .into_inner()
            .event
            .unwrap()
    };
    // Named, but nobody has accepted yet
    assert_eq!(get().await.confirmed_hosts, Vec::<String>::new());
    assert_eq!(
        awaiting_host(named.identity()).await,
        std::slice::from_ref(&event_key),
    );
    let hosted = upcoming(named.identity(), None).await;
    assert_eq!(event_keys(&hosted.events), []);

    named.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Hosting,
        current_timestamp(),
    );
    named.submit_events().await;
    declines.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::NotGoing,
        current_timestamp(),
    );
    declines.submit_events().await;
    // Not named, so this is ignored
    unnamed.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Hosting,
        current_timestamp(),
    );
    unnamed.submit_events().await;

    let event = get().await;
    assert_eq!(event.confirmed_hosts, [named.identity()]);
    // Hosts aren't counted
    assert_eq!(counts(&event), (0, 0, 1));
    assert_eq!(
        list_attendees(&event_key, Some(CalendarEventRsvpStatus::Hosting))
            .await,
        [named.identity()],
    );

    // Accepted hosts list the event. Answering clears the request
    let hosted = upcoming(named.identity(), None).await;
    assert_eq!(event_keys(&hosted.events), std::slice::from_ref(&event_key));
    assert_eq!(awaiting_host(named.identity()).await, []);
    assert_eq!(awaiting_host(declines.identity()).await, []);
    let hosted = upcoming(declines.identity(), None).await;
    assert_eq!(event_keys(&hosted.events), []);
}

#[tokio::test]
async fn calendar_event_creator_host() {
    let mut creator = TestClient::new().await;
    let event = |hosts: Vec<String>| CalendarEvent {
        id: random_string(),
        title: "Who hosts".to_owned(),
        description: None,
        start_at: current_timestamp() + 60 * 60 * 1000,
        end_at: None,
        location: None,
        labels: Vec::new(),
        all_day: false,
        image: None,
        timezone: None,
        hosts,
    };
    creator.calendar_event(
        event(vec![creator.identity().to_owned()]),
        current_timestamp(),
    );
    let hosted = creator.get_last_event_key();
    creator.calendar_event(event(Vec::new()), current_timestamp());
    let hostless = creator.get_last_event_key();
    creator.submit_events().await;

    let confirmed_hosts = |event_key: EventKey| async move {
        calendar_service()
            .await
            .get_calendar_event(GetCalendarEventRequest {
                event_key: Some(event_key),
            })
            .await
            .unwrap()
            .into_inner()
            .event
            .unwrap()
            .confirmed_hosts
    };
    // The creator doesn't need to accept
    assert_eq!(confirmed_hosts(hosted).await, [creator.identity()]);
    // Hosts are optional
    assert_eq!(confirmed_hosts(hostless).await, Vec::<String>::new());

    // The creator isn't asked to host their own event
    assert_eq!(awaiting_host(creator.identity()).await, []);
}

#[tokio::test]
async fn calendar_event_late_rsvps() {
    let mut host = TestClient::new().await;
    // Finished 23 hours ago
    host.calendar_event_titled("Yesterday", -24, current_timestamp());
    let event_key = host.get_last_event_key();
    host.submit_events().await;

    let mut late = TestClient::new().await;
    late.rsvp(
        event_key.clone(),
        CalendarEventRsvpStatus::Going,
        current_timestamp(),
    );
    late.submit_events().await;

    let event = calendar_service()
        .await
        .get_calendar_event(GetCalendarEventRequest {
            event_key: Some(event_key.clone()),
        })
        .await
        .unwrap()
        .into_inner()
        .event
        .unwrap();
    assert_eq!(counts(&event), (0, 0, 0));
    assert_eq!(list_attendees(&event_key, None).await, Vec::<String>::new());
}

#[tokio::test]
async fn calendar_event_all_day() {
    const DAY_MS: u64 = 24 * 60 * 60 * 1000;
    let now = current_timestamp();

    let mut host = TestClient::new().await;
    // Today, which started at midnight UTC and has no end
    let event = CalendarEvent {
        id: random_string(),
        title: "Today".to_owned(),
        start_at: now - now % DAY_MS,
        all_day: true,
        ..Default::default()
    };
    host.calendar_event(event, now);
    let event_key = host.get_last_event_key();
    host.submit_events().await;

    let mut going = TestClient::new().await;
    going.rsvp(event_key.clone(), CalendarEventRsvpStatus::Going, now);
    going.submit_events().await;

    // Still on until the day is over
    let listed = upcoming(host.identity(), None).await;
    assert_eq!(event_keys(&listed.events), [event_key]);
    assert_eq!(counts(&listed.events[0]), (1, 0, 0));
}

#[tokio::test]
async fn calendar_event_cover_is_requested_as_blob() {
    let mut client = TestClient::new().await;
    let body = format!("cover-{}", random_string()).into_bytes();
    let blob = Blob {
        digest: Some(content_digest(&body)),
        mime_type: "image/jpeg".to_owned(),
        size: body.len() as i64,
    };
    let event = CalendarEvent {
        id: random_string(),
        title: "With a cover".to_owned(),
        description: None,
        start_at: current_timestamp() + 60 * 60 * 1000,
        end_at: None,
        location: None,
        labels: Vec::new(),
        all_day: false,
        image: Some(ImageSet {
            images: vec![Image {
                blob: Some(blob.clone()),
                width: 100,
                height: 100,
            }],
        }),
        timezone: None,
        hosts: Vec::new(),
    };
    client.calendar_event(event, current_timestamp());
    let event_bundles = client.take_pending_events();

    let request = as_identity(
        client.identity(),
        client.signing_key(),
        PutEventsRequest { event_bundles },
    );
    let response = client
        .event_sync_client()
        .put_events(request)
        .await
        .expect("put_events failed")
        .into_inner();

    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    assert_eq!(response.requested_blobs, vec![blob]);
}
