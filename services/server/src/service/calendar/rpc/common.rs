//! Pipeline stages shared by the calendar handlers

use entity::content;
use polycentric_common::models::collections;
use prost::Message;
use tonic::Status;

use crate::data::filter::Filtered;
use crate::data::hydration::{self, HydrateConfig, HydrationState};
use crate::data::pipeline::Fetched;
use crate::data::{
    EventId, EventRow, EventWithContentRow, PageInfo, assemble_bundle,
};
use crate::service::calendar::repository::Query as Repository;
use crate::service::context::PublicContext;
use crate::service::events::TargetEventKey;
use crate::service::proofs::service::attach_proofs;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    CalendarEventBundle, Content, EventHint, EventKey,
};

/// Validate an event key from a request. Must be in the calendar collection
pub(crate) fn calendar_event_key(
    key: Option<EventKey>,
    field: &str,
) -> Result<TargetEventKey, Status> {
    let key = TargetEventKey::from_request(key, field)?;
    if i32::from(key.collection) != collections::CALENDAR {
        return Err(Status::invalid_argument(format!(
            "{field} is not in the calendar collection"
        )));
    }
    Ok(key)
}

/// Tombstones, blocks, labels, and identity and profile events for the rows
pub(crate) async fn hydrate<P, SortedBy>(
    ctx: &mut PublicContext,
    _: &P,
    fetched: &Fetched<EventWithContentRow, SortedBy>,
) -> Result<HydrationState, Status> {
    hydration::hydrate(ctx, &fetched.rows, &HydrateConfig::default()).await
}

/// Calendar events with their stats, plus hints
pub(crate) struct CalendarEventsView<SortedBy> {
    pub events: Vec<CalendarEventBundle>,
    pub event_hints: Vec<EventHint>,
    pub page_info: PageInfo<SortedBy>,
}

/// Bundle the calendar events with their RSVP counts and hosts
pub(crate) async fn view<P, SortedBy>(
    ctx: &mut PublicContext,
    _: &P,
    filtered: Filtered<EventWithContentRow, SortedBy>,
    hydration: HydrationState,
) -> Result<CalendarEventsView<SortedBy>, Status> {
    let Filtered { rows, page_info } = filtered;
    let ids: Vec<EventId> = rows.iter().map(EventRow::event_id).collect();
    let mut stats = Repository::count_rsvps(&mut ctx.db, &ids).await?;
    let mut hosts = Repository::confirmed_hosts(&mut ctx.db, &ids).await?;

    let mut events = Vec::with_capacity(rows.len());
    for row in rows {
        let (event, content) = &row;
        let id = event.id;
        let mut confirmed_hosts = hosts.remove(&id).unwrap_or_default();
        // The creator doesn't need to accept
        if names_host(content.as_ref(), &event.identity) {
            confirmed_hosts.retain(|host| *host != event.identity);
            confirmed_hosts.insert(0, event.identity.clone());
        }
        events.push(CalendarEventBundle {
            event_bundle: Some(assemble_bundle(row, &hydration.stats)),
            // No RSVPs means no counts
            stats: Some(stats.remove(&id).unwrap_or_default()),
            confirmed_hosts,
        });
    }
    attach_proofs(
        ctx,
        events.iter_mut().filter_map(|e| e.event_bundle.as_mut()),
    )
    .await?;
    Ok(CalendarEventsView {
        events,
        event_hints: hydration.into_hints(),
        page_info,
    })
}

/// The calendar event names `identity` as a host
fn names_host(content: Option<&content::Model>, identity: &str) -> bool {
    let content = content.and_then(|content| {
        Content::decode(content.serialized_bytes.as_slice()).ok()
    });
    match content.and_then(|content| content.content_body) {
        Some(ContentBody::CalendarEvent(event)) => {
            event.hosts.iter().any(|host| host == identity)
        }
        _ => false,
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use sea_orm::{DbBackend, MockDatabase};

    use crate::service::context::PublicContext;
    use crate::service::proto::{EventKey, PublicKey};
    use crate::service::verifications::rpc::common::tests::ctx;

    /// Context with an empty database, for requests rejected before any query
    pub(crate) async fn ctx_without_rows() -> PublicContext {
        let db = MockDatabase::new(DbBackend::Postgres).into_connection();
        ctx(db)
            .await
            .public_rw(&tonic::Request::new(()))
            .await
            .unwrap()
    }

    pub(crate) fn event_key(collection: i32) -> EventKey {
        EventKey {
            collection,
            identity: "alice".to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![0xaa],
            }),
            sequence: 7,
        }
    }
}
