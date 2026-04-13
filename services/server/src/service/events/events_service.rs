use super::events_repository as EventsRepository;
use crate::service::content::content_repository as ContentRepository;
use crate::service::proto::content::ContentBody;
use crate::service::proto::event_sync_service_server::{
    EventSyncService, EventSyncServiceServer,
};
use crate::service::proto::{
    Content, Event, EventBundle, PutEventsRequest, PutEventsResponse,
    SerializedContent, SignedEvent,
};
use crate::service::proto::{ListEventsRequest, ListEventsResponse};
use crate::util;
use ::entity::{
    content_block_model as ContentBlockModel,
    content_delete_model as ContentDeleteModel,
    content_follow_model as ContentFollowModel,
    content_identity_model as ContentIdentityModel,
    content_model as ContentModel, content_post_model as ContentPostModel,
    content_reaction_model as ContentReactionModel, event_model as EventModel,
};
use prost::Message;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::TransactionTrait;
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
        let inner_req = request.into_inner();
        let limit = inner_req.limit.unwrap_or(200).min(200) as u64;
        let collection = inner_req.collection;
        let identity = inner_req.identity;
        let signed_by = inner_req.signed_by;

        let events = EventsRepository::Query::list_events(
            &self.db,
            Some(limit),
            collection,
            identity,
            signed_by,
        )
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

        let reply = ListEventsResponse {
            event_bundles,
            previous_token: String::new(),
            next_token: String::new(),
        };
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
            let synced_at =
                time::PrimitiveDateTime::new(now.date(), now.time());

            let created_at_offset = time::OffsetDateTime::from_unix_timestamp(
                (event.created_at / 1000) as i64,
            )
            .unwrap_or(now);
            let created_at = time::PrimitiveDateTime::new(
                created_at_offset.date(),
                created_at_offset.time(),
            );

            let content_digest = event.content_digest;

            // If SerializedContent was provided in the bundle, verify checksum and save
            if let (Some(serialized_content), Some(digest)) =
                (&event_bundle.serialized_content, &content_digest)
            {
                // Verify the content digest matches the serialized bytes
                util::digest::verify_content_digest(
                    digest.r#type,
                    &digest.value,
                    &serialized_content.content_bytes,
                )
                .map_err(|e| Status::invalid_argument(e.to_string()))?;

                // Decode the content before starting the transaction
                let content = Content::decode(
                    serialized_content.content_bytes.as_slice(),
                )
                .map_err(|e| {
                    eprintln!("sync_events content decode error: {e}");
                    Status::invalid_argument("invalid content_bytes")
                })?;

                // Save content parent + child in a transaction
                let txn = self.db.begin().await.map_err(|e| {
                    eprintln!("sync_events txn begin error: {e}");
                    Status::internal("internal server error")
                })?;

                // Try to insert content; skip if it already exists
                let content_result = ContentRepository::Mutation::add_content(
                    &txn,
                    ContentModel::ActiveModel {
                        id: NotSet,
                        digest_type: Set(digest.r#type),
                        digest_bytes: Set(digest.value.clone()),
                        serialized_bytes: Set(serialized_content
                            .content_bytes
                            .clone()),
                        synced_at: Set(synced_at),
                    },
                )
                .await;

                match content_result {
                    Ok(content_row) => {
                        save_content_child(
                            &txn,
                            content_row.id,
                            content,
                            &key.identity,
                        )
                        .await?;
                    }
                    Err(ref e) if Self::is_unique_violation(e) => {
                        // Content already exists, skip
                    }
                    Err(e) => {
                        eprintln!("sync_events content db error: {e}");
                        return Err(Status::internal("internal server error"));
                    }
                }

                txn.commit().await.map_err(|e| {
                    eprintln!("sync_events txn commit error: {e}");
                    Status::internal("internal server error")
                })?;
            }

            // Build the Model that we will save to the database
            let active_model = EventModel::ActiveModel {
                id: NotSet,
                collection: Set(key.collection as i16),
                identity: Set(key.identity),
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
                created_at: Set(created_at),
                synced_at: Set(synced_at),
            };

            // Add the event to the database, skipping duplicates
            match EventsRepository::Mutation::add_event(&self.db, active_model)
                .await
            {
                Ok(_) => {}
                Err(ref e) if Self::is_unique_violation(e) => {
                    // Duplicate event, skip
                }
                Err(e) => {
                    eprintln!("sync_events db error: {e:?}");
                    return Err(Status::internal("internal server error"));
                }
            }
        }

        Ok(Response::new(PutEventsResponse {}))
    }
}

impl EventSyncServiceImpl {
    fn is_unique_violation(err: &sea_orm::DbErr) -> bool {
        let runtime_err = match err {
            sea_orm::DbErr::Query(e) | sea_orm::DbErr::Exec(e) => Some(e),
            _ => None,
        };
        if let Some(sea_orm::RuntimeErr::SqlxError(arc_err)) = runtime_err
            && let Some(db_err) = arc_err.as_database_error()
        {
            return db_err.is_unique_violation();
        }
        false
    }
}

// ──────────────────────────────────────────────────────────────────
// After saving the parent `content` row, we decode the serialized
// bytes into the proto Content message and persist the type-specific
// fields into the matching child table.
//
// Content.content_body is a oneof with these variants:
//   Post           → content_post
//   Delete         → content_delete
//   Follow         → content_follow
//   Block          → content_block
//   Reaction       → content_reaction
//   ProfileUpdate  → content_profile_update
//   Identity       → content_identity
// ──────────────────────────────────────────────────────────────────
async fn save_content_child<C: sea_orm::ConnectionTrait>(
    db: &C,
    content_id: i64,
    content: Content,
    event_identity: &str,
) -> Result<(), Status> {
    let map_db_err = |e: sea_orm::DbErr| {
        eprintln!("save_content_child db error: {e}");
        Status::internal("internal server error")
    };

    match content.content_body {
        // ── Post ──────────────────────────────────────────────
        // A text post with an optional reply chain.
        Some(ContentBody::Post(post)) => {
            let (reply_root, reply_parent) = match post.reply {
                Some(reply) => (reply.root, reply.parent),
                None => (None, None),
            };

            ContentPostModel::ActiveModel {
                content_id: Set(content_id),
                text: Set(post.text),
                // Reply root EventKey (all None when not a reply)
                reply_root_collection: Set(reply_root
                    .as_ref()
                    .map(|k| k.collection as i16)),
                reply_root_identity: Set(reply_root
                    .as_ref()
                    .map(|k| k.identity.clone())),
                reply_root_public_key_type: Set(reply_root.as_ref().and_then(
                    |k| k.signed_by.as_ref().map(|s| s.key_type as i16),
                )),
                reply_root_public_key: Set(reply_root
                    .as_ref()
                    .and_then(|k| k.signed_by.as_ref().map(|s| s.key.clone()))),
                reply_root_sequence: Set(reply_root
                    .as_ref()
                    .map(|k| k.sequence as i64)),
                // Reply parent EventKey (all None when not a reply)
                reply_parent_collection: Set(reply_parent
                    .as_ref()
                    .map(|k| k.collection as i16)),
                reply_parent_identity: Set(reply_parent
                    .as_ref()
                    .map(|k| k.identity.clone())),
                reply_parent_public_key_type: Set(reply_parent
                    .as_ref()
                    .and_then(|k| {
                        k.signed_by.as_ref().map(|s| s.key_type as i16)
                    })),
                reply_parent_public_key: Set(reply_parent
                    .as_ref()
                    .and_then(|k| k.signed_by.as_ref().map(|s| s.key.clone()))),
                reply_parent_sequence: Set(reply_parent
                    .as_ref()
                    .map(|k| k.sequence as i64)),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        // ── Delete ────────────────────────────────────────────
        // Marks a previous event for deletion by its EventKey.
        Some(ContentBody::Delete(delete)) => {
            let key = delete.event_key.ok_or_else(|| {
                Status::invalid_argument("delete content missing event_key")
            })?;
            let signed_by = key.signed_by.ok_or_else(|| {
                Status::invalid_argument("delete event_key missing signed_by")
            })?;

            ContentDeleteModel::ActiveModel {
                content_id: Set(content_id),
                event_key_collection: Set(key.collection as i16),
                event_key_identity: Set(key.identity),
                event_key_public_key_type: Set(signed_by.key_type as i16),
                event_key_public_key: Set(signed_by.key),
                event_key_sequence: Set(key.sequence as i64),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        // ── Follow ───────────────────────────────────────────
        Some(ContentBody::Follow(follow)) => {
            ContentFollowModel::ActiveModel {
                content_id: Set(content_id),
                identity_id: Set(follow.identity),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        // ── Block ────────────────────────────────────────────
        Some(ContentBody::Block(block)) => {
            ContentBlockModel::ActiveModel {
                content_id: Set(content_id),
                identity_id: Set(block.identity),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        // ── Reaction ─────────────────────────────────────────
        // A reaction (like/dislike/emoji) to another event.
        Some(ContentBody::Reaction(reaction)) => {
            let key = reaction.event_key.ok_or_else(|| {
                Status::invalid_argument("reaction content missing event_key")
            })?;
            let signed_by = key.signed_by.ok_or_else(|| {
                Status::invalid_argument("reaction event_key missing signed_by")
            })?;

            ContentReactionModel::ActiveModel {
                content_id: Set(content_id),
                event_key_collection: Set(key.collection as i16),
                event_key_identity: Set(key.identity),
                event_key_public_key_type: Set(signed_by.key_type as i16),
                event_key_public_key: Set(signed_by.key),
                event_key_sequence: Set(key.sequence as i64),
                emoji: Set(reaction.emoji),
                opinion: Set(reaction.opinion as i16),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        // ── ProfileUpdate ────────────────────────────────────
        // Update display name, avatar, or banner.
        Some(ContentBody::ProfileUpdate(_profile)) => {
            // TODO: save profile update with avatar/banner digests
        }

        // ── Identity ─────────────────────────────────────────
        // Stores the current identity document (rotation_keys + signing_keys).
        Some(ContentBody::Identity(identity)) => {
            let identity_bytes = prost::Message::encode_to_vec(&identity);

            ContentIdentityModel::ActiveModel {
                content_id: Set(content_id),
                identity: Set(event_identity.to_string()),
                identity_bytes: Set(identity_bytes),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        // ── No content body ──────────────────────────────────
        None => {}
    }

    Ok(())
}

pub fn build_events_service(
    db: sea_orm::DatabaseConnection,
) -> EventSyncServiceServer<EventSyncServiceImpl> {
    EventSyncServiceServer::new(EventSyncServiceImpl { db })
}
