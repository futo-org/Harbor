//! `put_events`: ingest signed events. Mutation — does not use the
//! events pipeline.

use crate::{
    service::{
        content::content_repository as ContentRepository,
        content::repository::Mutation as ContentChildRepository,
        context::ServiceContext,
        events::repository as EventsRepository,
        identity::service::authorize_event_signer,
        proto::{
            Content, Event, EventBundle, PublicKey, PutEventError,
            PutEventsRequest, PutEventsResponse,
        },
    },
    util,
};
use ::entity::{content_model as ContentModel, event_model as EventModel};
use common_kafka::FutureRecord;
use polycentric_common::models::{collections, protos_v2::Blob};
use prost::Message;
use rdkafka::message::{Header, OwnedHeaders};
use sea_orm::{
    ActiveValue::{NotSet, Set},
    TransactionTrait,
};
use std::{collections::HashSet, sync::LazyLock, time::Duration};
use time::OffsetDateTime;
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
                synced_at: Set(OffsetDateTime::now_utc()),
            },
        )
        .await
        .map_err(|e| {
            eprintln!("sync_events content db error: {e}");
            Status::internal("internal server error")
        })?;

        if let Some(content_row) = content_row {
            ContentChildRepository::save_content_child(
                &txn,
                content_row.id,
                content,
                &key.identity,
            )
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
        created_at: Set(OffsetDateTime::from_unix_timestamp(
            (event.created_at / 1000) as i64,
        )
        .unwrap_or(OffsetDateTime::now_utc())),
        synced_at: Set(OffsetDateTime::now_utc()),
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
