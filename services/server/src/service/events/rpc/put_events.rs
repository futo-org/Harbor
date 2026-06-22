//! `put_events`: ingest signed events. Mutation — does not use the
//! events pipeline.

use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::Duration;

use crate::service::content::content_repository as ContentRepository;
use crate::service::context::ServiceContext;
use crate::service::events::repository as EventsRepository;
use crate::service::identity::service::authorize_event_signer;
use crate::service::proto::content::ContentBody;
use crate::service::proto::{
    Content, Event, EventBundle, PublicKey, PutEventError, PutEventsRequest,
    PutEventsResponse,
};
use crate::util;
use ::entity::{
    content_block_model as ContentBlockModel,
    content_delete_model as ContentDeleteModel,
    content_follow_model as ContentFollowModel,
    content_identity_model as ContentIdentityModel,
    content_label_model as ContentLabelModel, content_model as ContentModel,
    content_post_model as ContentPostModel,
    content_reaction_model as ContentReactionModel,
    content_report_model as ContentReportModel,
    content_repost_model as ContentRepostModel, event_model as EventModel,
};
use common_kafka::FutureRecord;
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::Blob;
use prost::Message;
use rdkafka::message::{Header, OwnedHeaders};
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::EntityTrait;
use sea_orm::TransactionTrait;
use tonic::Status;

static SERVER_NAME: LazyLock<String> = LazyLock::new(|| {
    std::env::var("POLYCENTRIC_SERVER_NAME").unwrap_or_default()
});

/// Ingest a batch of signed events. Each event is processed in
/// isolation with failures reported back in `PutEventsResponse.errors`
pub async fn handle(
    ctx: &ServiceContext,
    req: PutEventsRequest,
) -> Result<PutEventsResponse, Status> {
    let mut errors: Vec<PutEventError> = Vec::new();
    let mut all_blobs = HashSet::<Blob>::new();

    for (idx, event_bundle) in req.event_bundles.into_iter().enumerate() {
        match process_event(ctx, event_bundle).await {
            Ok(blobs) => {
                all_blobs.extend(blobs);
            }

            Err(status) => {
                eprintln!(
                    "put_events[{idx}] skipped: {} {}",
                    status.code(),
                    status.message()
                );
                errors.push(PutEventError {
                    event_bundle_index: idx as u32,
                    message: format!("{}: {}", status.code(), status.message()),
                });
            }
        }
    }

    let missing_blobs = remove_present_blobs(ctx, all_blobs)
        .await
        .unwrap_or_else(|e| {
            // A failure occurred while checking what blobs the server already has.
            // Assume the server is not in a condition to accept new blobs and silently
            // return no missing blobs to the client.
            eprintln!("put_events blob processing: {e}");
            vec![]
        });

    Ok(PutEventsResponse {
        errors,
        requested_blobs: missing_blobs,
    })
}

/// Validate and persist an event.
/// Returns all blobs referenced by the event.
async fn process_event(
    ctx: &ServiceContext,
    event_bundle: EventBundle,
) -> Result<Vec<Blob>, Status> {
    let mut blobs = Vec::<Blob>::new();

    // Encode the bundle up front while it's still whole — its fields are
    // moved out during validation below. Published to Kafka on success.
    let event_bundle_bytes = event_bundle.encode_to_vec();

    let signed_event = event_bundle.signed_event.ok_or_else(|| {
        Status::invalid_argument("package is missing signed event")
    })?;

    let event =
        Event::decode(signed_event.event_bytes.as_slice()).map_err(|e| {
            eprintln!("sync_events decode error: {e}");
            Status::invalid_argument("invalid event_bytes")
        })?;

    let key = event
        .key
        .ok_or_else(|| Status::invalid_argument("event missing key"))?;

    // Kafka partition/message key: the serialized protobuf event key.
    // Encoded here while `key` is whole — its fields are moved out below.
    let event_key_bytes = key.encode_to_vec();

    let signed_by = key.signed_by.ok_or_else(|| {
        Status::invalid_argument("event key missing signed_by")
    })?;

    polycentric_common::signing::verify_signature(
        &signed_by.key,
        &signed_event.signature,
        &signed_event.event_bytes,
    )
    .map_err(|e| Status::unauthenticated(e.to_string()))?;

    // Authorize the signer against the target identity's chain.
    // Identity events are chain-validated at read time (see
    // `latest_valid_identity_content`); every other event must
    // be signed by a key the identity currently authorizes, or
    // by a key whose revocation bound still vouches for this
    // signature.
    if key.collection != collections::IDENTITY {
        authorize_event_signer(
            ctx,
            &key.identity,
            &PublicKey {
                key_type: signed_by.key_type,
                key: signed_by.key.clone(),
            },
            key.collection,
            &signed_event.signature,
        )
        .await?;
    }

    let now = time::OffsetDateTime::now_utc();
    let synced_at = time::PrimitiveDateTime::new(now.date(), now.time());

    let created_at_offset = time::OffsetDateTime::from_unix_timestamp(
        (event.created_at / 1000) as i64,
    )
    .unwrap_or(now);
    let created_at = time::PrimitiveDateTime::new(
        created_at_offset.date(),
        created_at_offset.time(),
    );

    let content_digest = event.content_digest;

    if let (Some(serialized_content), Some(digest)) =
        (&event_bundle.serialized_content, &content_digest)
    {
        util::digest::verify_content_digest(
            digest.r#type,
            &digest.value,
            &serialized_content.content_bytes,
        )
        .map_err(|e| Status::invalid_argument(e.to_string()))?;

        let content =
            Content::decode(serialized_content.content_bytes.as_slice())
                .map_err(|e| {
                    eprintln!("sync_events content decode error: {e}");
                    Status::invalid_argument("invalid content_bytes")
                })?;

        content
            .blobs()
            .into_iter()
            .for_each(|blob| blobs.push(blob.clone()));

        let txn = ctx.db.begin().await.map_err(|e| {
            eprintln!("sync_events txn begin error: {e}");
            Status::internal("internal server error")
        })?;

        let content_row = ContentRepository::Mutation::add_content(
            &txn,
            ContentModel::ActiveModel {
                id: NotSet,
                digest_type: Set(digest.r#type),
                digest_bytes: Set(digest.value.clone()),
                serialized_bytes: Set(serialized_content.content_bytes.clone()),
                synced_at: Set(synced_at),
            },
        )
        .await
        .map_err(|e| {
            eprintln!("sync_events content db error: {e}");
            Status::internal("internal server error")
        })?;

        if let Some(content_row) = content_row {
            save_content_child(&txn, content_row.id, content, &key.identity)
                .await?;
        }

        txn.commit().await.map_err(|e| {
            eprintln!("sync_events txn commit error: {e}");
            Status::internal("internal server error")
        })?;
    }

    let event_identity = key.identity.clone();
    let event_collection = key.collection;

    let active_model = EventModel::ActiveModel {
        id: NotSet,
        collection: Set(key.collection as i16),
        identity: Set(key.identity),
        public_key_type: Set(signed_by.key_type as i16),
        public_key: Set(signed_by.key),
        sequence: Set(key.sequence as i64),
        content_digest_type: Set(content_digest.as_ref().map(|d| d.r#type)),
        content_digest_bytes: Set(content_digest
            .as_ref()
            .map(|d| d.value.clone())),
        signature: Set(signed_event.signature),
        previous_signature: Set(event.previous_signature),
        previous_root: Set(event.previous_root),
        event_bytes: Set(signed_event.event_bytes),
        created_at: Set(created_at),
        synced_at: Set(synced_at),
    };

    match EventsRepository::Mutation::add_event(&ctx.db, active_model).await {
        Ok(_) => {
            ctx.proof_cache
                .invalidate_canonical(&event_identity, event_collection)
                .await;
            if event_collection == collections::IDENTITY {
                ctx.proof_cache.invalidate_identity(&event_identity).await;
            }

            let producer = ctx.kafka_producer.clone();
            tokio::spawn(async move {
                if let Err((e, _)) = producer
                    .send(
                        FutureRecord::to("events")
                            .key(&event_key_bytes)
                            .payload(&event_bundle_bytes)
                            .headers(OwnedHeaders::new().insert(Header {
                                key: "SOURCE_SERVER",
                                value: Some(SERVER_NAME.as_str()),
                            })),
                        Duration::from_secs(0),
                    )
                    .await
                {
                    eprintln!("put_events kafka publish error: {e}");
                }
            });
        }
        Err(ref e) if is_unique_violation(e) => {
            // Duplicate event — already stored, treat as success.
        }
        Err(e) => {
            eprintln!("sync_events db error: {e:?}");
            return Err(Status::internal("internal server error"));
        }
    }

    Ok(blobs)
}

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

/// Save content to normalized tables for better querying
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
        Some(ContentBody::Post(post)) => {
            let (reply_root, reply_parent) = match post.reply {
                Some(reply) => (reply.root, reply.parent),
                None => (None, None),
            };
            let quote = post.quote;

            ContentPostModel::ActiveModel {
                content_id: Set(content_id),
                text: Set(post.text),
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
                quote_collection: Set(quote
                    .as_ref()
                    .map(|k| k.collection as i16)),
                quote_identity: Set(quote.as_ref().map(|k| k.identity.clone())),
                quote_public_key_type: Set(quote.as_ref().and_then(|k| {
                    k.signed_by.as_ref().map(|s| s.key_type as i16)
                })),
                quote_public_key: Set(quote
                    .as_ref()
                    .and_then(|k| k.signed_by.as_ref().map(|s| s.key.clone()))),
                quote_sequence: Set(quote.as_ref().map(|k| k.sequence as i64)),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

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

        Some(ContentBody::Follow(follow)) => {
            ContentFollowModel::ActiveModel {
                content_id: Set(content_id),
                identity_id: Set(follow.identity),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        Some(ContentBody::Block(block)) => {
            ContentBlockModel::ActiveModel {
                content_id: Set(content_id),
                identity_id: Set(block.identity),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

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
                positive: Set(reaction.positive),
            }
            .insert(db)
            .await
            .map_err(map_db_err)?;
        }

        Some(ContentBody::ProfileUpdate(_profile)) => {
            // TODO: save profile update with avatar/banner digests
        }

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

        Some(ContentBody::Repost(repost)) => {
            // A repost with no target is a no-op — the parent
            // `content` row still carries the serialized bytes.
            if let Some(key) = repost.post {
                let signed_by = key.signed_by.ok_or_else(|| {
                    Status::invalid_argument(
                        "repost event_key missing signed_by",
                    )
                })?;

                ContentRepostModel::ActiveModel {
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
        }

        Some(ContentBody::Report(report)) => {
            let key = report.event_key.ok_or_else(|| {
                Status::invalid_argument("report content missing event_key")
            })?;
            let signed_by = key.signed_by.ok_or_else(|| {
                Status::invalid_argument("report event_key missing signed_by")
            })?;

            ContentReportModel::ActiveModel {
                content_id: Set(content_id),
                category: Set(report.category as i16),
                additional_info: Set(report.additional_info),
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

        Some(ContentBody::Labels(labels)) => {
            let key = labels.event_key.ok_or_else(|| {
                Status::invalid_argument("labels content missing event_key")
            })?;
            let signed_by = key.signed_by.ok_or_else(|| {
                Status::invalid_argument("labels event_key missing signed_by")
            })?;

            // One row per label value for efficient aggregation; the
            // labeled event's key is denormalized onto each row.
            let rows: Vec<ContentLabelModel::ActiveModel> = labels
                .label_values
                .into_iter()
                .map(|label_value| ContentLabelModel::ActiveModel {
                    content_id: Set(content_id),
                    label_value: Set(label_value),
                    event_key_collection: Set(key.collection as i16),
                    event_key_identity: Set(key.identity.clone()),
                    event_key_public_key_type: Set(signed_by.key_type as i16),
                    event_key_public_key: Set(signed_by.key.clone()),
                    event_key_sequence: Set(key.sequence as i64),
                })
                .collect();

            if !rows.is_empty() {
                ContentLabelModel::Entity::insert_many(rows)
                    .exec(db)
                    .await
                    .map_err(map_db_err)?;
            }
        }

        Some(ContentBody::VerificationClaim(_))
        | Some(ContentBody::VerificationVerify(_)) => {}

        None => {}
    }

    Ok(())
}

/// Keep only the blobs that are not already present
async fn remove_present_blobs(
    ctx: &ServiceContext,
    blobs: HashSet<Blob>,
) -> Result<Vec<Blob>, Status> {
    let digests: Vec<_> = blobs
        .iter()
        .filter_map(|blob| blob.digest.as_ref())
        .collect();

    let already_present =
        ContentRepository::Query::find_digests_in_db(&ctx.db, &digests)
            .await
            .map_err(|e| {
                eprintln!("put_events blob db error: {e}");
                Status::internal("internal server error")
            })?;

    let missing_blobs = blobs
        .into_iter()
        .filter(|blob| match &blob.digest {
            Some(digest) => !already_present.contains(digest),
            None => false, // Ignore blobs missing a content digest
        })
        .collect();

    Ok(missing_blobs)
}
