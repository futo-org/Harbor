use super::events_repository as EventsRepository;
use crate::lib::content::content_repository as ContentRepository;
use crate::lib::proto::content::ContentBody;
use crate::lib::proto::event_sync_service_server::{
    EventSyncService, EventSyncServiceServer,
};
use crate::lib::proto::{
    Content, Event, EventBundle, Post, PutEventsRequest, PutEventsResponse,
    SerializedContent, SignedEvent,
};
use crate::lib::proto::{ListEventsRequest, ListEventsResponse};
use crate::util;
use ::entity::{content_model as ContentModel, event_model as EventModel};
use prost::Message;
use sea_orm::ActiveValue::{NotSet, Set};
use tonic::{Request, Response, Status};

#[derive(Debug)]
pub struct EventSyncServiceImpl {
    db: sea_orm::DatabaseConnection,
}

/// Implementation of the EventsService
#[tonic::async_trait]
impl EventSyncService for EventSyncServiceImpl {
    // List events based on the request values
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsResponse>, Status> {
        let limit = request.into_inner().limit.unwrap_or(10).min(200) as u64;

        let events =
            EventsRepository::Query::list_events(&self.db, Some(limit))
                .await
                .map_err(|e| {
                    eprintln!("list_events error: {e}");
                    Status::internal("internal server error")
                })?;

        // Turn the events into event bundles
        let mut event_bundles: Vec<EventBundle> = vec![];

        for (event, content) in events {
            // Reconstruct the SignedEvent with the serialized bytes and the signature
            let signed_event = SignedEvent {
                event_bytes: event.event_bytes,
                signature: event.signature,
            };

            // Reconstruct SerializedContent with the serialized bytes if content exists.
            // We do this because the checksum is constructed from already serialized bytes.
            let serialized_content = content.map(|c| SerializedContent {
                content_bytes: c.serialized_bytes,
            });

            // Form the bundle of the SignedEvent and Content
            let event_bundle = EventBundle {
                signed_event: Some(signed_event),
                serialized_content,
            };

            event_bundles.push(event_bundle);
        }

        let reply = ListEventsResponse { event_bundles };
        Ok(Response::new(reply))
    }

    // Sync events from a client to the server
    async fn put_events(
        &self,
        request: Request<PutEventsRequest>,
    ) -> Result<Response<PutEventsResponse>, Status> {
        let event_bundles = request.into_inner().event_bundles;

        for event_bundle in event_bundles {
            let signed_event = event_bundle.signed_event.ok_or_else(|| {
                Status::invalid_argument("package is missing signed event")
            })?;

            // Deserialize the event_bytes into the proto Event
            let event = Event::decode(signed_event.event_bytes.as_slice())
                .map_err(|e| {
                    eprintln!("sync_events decode error: {e}");
                    Status::invalid_argument("invalid event_bytes")
                })?;

            let key = event
                .key
                .ok_or_else(|| Status::invalid_argument("event missing key"))?;

            let signed_by = key.signed_by.ok_or_else(|| {
                Status::invalid_argument("event key missing signed_by")
            })?;

            // Validate the ed25519 signature against the event_bytes
            util::signing::verify_signature(
                &signed_by.key,
                &signed_event.signature,
                &signed_event.event_bytes,
            )
            .map_err(|e| Status::unauthenticated(e.to_string()))?;

            let now = time::OffsetDateTime::now_utc();
            let now = time::PrimitiveDateTime::new(now.date(), now.time());

            let content_digest = event.content_digest;

            // If SerializedContent was provided in the bundle, save it to the database
            if let (Some(serialized_content), Some(digest)) =
                (&event_bundle.serialized_content, &content_digest)
            {
                let content_model = ContentModel::ActiveModel {
                    id: NotSet,
                    digest_type: Set(digest.r#type),
                    digest_bytes: Set(digest.value.clone()),
                    serialized_bytes: Set(serialized_content.content_bytes.clone()),
                    synced_at: Set(now),
                };
                ContentRepository::Mutation::add_content(
                    &self.db,
                    content_model,
                )
                .await
                .map_err(|e| {
                    eprintln!("sync_events content db error: {e}");
                    Status::internal("internal server error")
                })?;
            }

            // Build the Model that we will save to the database
            let active_model = EventModel::ActiveModel {
                id: NotSet,
                stream_id: Set(key.stream_id),
                public_key_type: Set(signed_by.key_type as i16),
                public_key: Set(signed_by.key),
                sequence: Set(key.sequence as i16),
                content_digest_type: Set(content_digest
                    .as_ref()
                    .map(|d| d.r#type)),
                content_digest_bytes: Set(content_digest
                    .as_ref()
                    .map(|d| d.value.clone())),
                signature: Set(signed_event.signature),
                previous_signature: Set(event.previous_signature),
                event_bytes: Set(signed_event.event_bytes),
                created_at: Set(now),
                synced_at: Set(now),
            };

            // Add the event to the database
            EventsRepository::Mutation::add_event(&self.db, active_model)
                .await
                .map_err(|e| {
                    eprintln!("sync_events db error: {e}");
                    Status::internal("internal server error")
                })?;
        }

        Ok(Response::new(PutEventsResponse {}))
    }
}

pub fn build_events_service(
    db: sea_orm::DatabaseConnection,
) -> EventSyncServiceServer<EventSyncServiceImpl> {
    EventSyncServiceServer::new(EventSyncServiceImpl { db })
}
