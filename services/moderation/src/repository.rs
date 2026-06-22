use moderation_entity::processed_content_model::{
    ActiveModel, Entity as ProcessedContent, Model as ProcessedContentModel, Status,
};
use moderation_entity::{created_content_model, created_event_model};
use polycentric_common::merkle;
use sea_orm::{
    ActiveModelTrait, ActiveValue::NotSet, ActiveValue::Set, ColumnTrait, ConnectionTrait,
    DatabaseConnection, DbErr, EntityTrait, QueryFilter, TransactionTrait, sea_query::OnConflict,
    sea_query::value::prelude::serde_json,
};
use time::OffsetDateTime;

use crate::polycentric::{ChainHead, CreatedEvent};

/// Persist an event we created (and its content) to the moderation DB, in
/// a single transaction. Re-publishing the same event is a no-op via the
/// primary keys (content digest / event key) — duplicates are ignored.
pub async fn persist_created(db: &DatabaseConnection, created: &CreatedEvent) -> Result<(), DbErr> {
    let txn = db.begin().await?;

    if let Some(digest) = created.event.content_digest.as_ref() {
        let content = created_content_model::ActiveModel {
            digest_type: Set(digest.r#type),
            digest_bytes: Set(digest.value.clone()),
            serialized_bytes: Set(created.content_bytes.clone()),
            created_at: Set(OffsetDateTime::now_utc()),
        };
        // Ignore a duplicate content row (already stored under this digest).
        created_content_model::Entity::insert(content)
            .on_conflict(
                OnConflict::columns([
                    created_content_model::Column::DigestType,
                    created_content_model::Column::DigestBytes,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec_without_returning(&txn)
            .await?;
    }

    let key = created
        .event
        .key
        .as_ref()
        .ok_or_else(|| DbErr::Custom("created event missing key".to_string()))?;
    let signed_by = key
        .signed_by
        .as_ref()
        .ok_or_else(|| DbErr::Custom("created event key missing signed_by".to_string()))?;

    let event = created_event_model::ActiveModel {
        collection: Set(key.collection),
        identity: Set(key.identity.clone()),
        public_key_type: Set(signed_by.key_type),
        public_key: Set(signed_by.key.clone()),
        sequence: Set(key.sequence as i64),
        content_digest_type: Set(created.event.content_digest.as_ref().map(|d| d.r#type)),
        content_digest_bytes: Set(created
            .event
            .content_digest
            .as_ref()
            .map(|d| d.value.clone())),
        signature: Set(created.signature.clone()),
        previous_signature: Set(created.event.previous_signature.clone()),
        previous_root: Set(created.event.previous_root.clone()),
        event_bytes: Set(created.event_bytes.clone()),
        created_at: Set(OffsetDateTime::from_unix_timestamp_nanos(
            (created.event.created_at as i128) * 1_000_000,
        )
        .unwrap_or_else(|_| OffsetDateTime::now_utc())),
    };
    // A duplicate event key means we authored the same sequence twice —
    // surface it as an error (rolls back the content insert above too).
    event.insert(&txn).await?;

    txn.commit().await
}

/// Read the next chain position for events we author in
pub async fn chain_head<C: ConnectionTrait>(
    db: &C,
    collection: i32,
    identity: &str,
    public_key_type: i32,
    public_key: &[u8],
) -> Result<ChainHead, DbErr> {
    let rows = created_event_model::Entity::find()
        .filter(created_event_model::Column::Collection.eq(collection))
        .filter(created_event_model::Column::Identity.eq(identity))
        .filter(created_event_model::Column::PublicKeyType.eq(public_key_type))
        .filter(created_event_model::Column::PublicKey.eq(public_key.to_vec()))
        .all(db)
        .await?;

    let next_sequence = rows
        .iter()
        .map(|r| r.sequence)
        .max()
        .map(|s| s as u64 + 1)
        .unwrap_or(1);

    // Canonical ordering depends on each event's full bytes (vector-clock
    // sum, created_at) paired with its signature — both stored per row.
    let canonical = merkle::canonical_signatures(
        rows.iter()
            .map(|r| (r.event_bytes.as_slice(), r.signature.as_slice())),
    );
    let previous_signature = canonical.last().cloned().unwrap_or_default();
    let previous_root = merkle::merkle_tree_hash(&canonical)
        .map(|h| h.to_vec())
        .unwrap_or_default();

    Ok(ChainHead {
        next_sequence,
        previous_signature,
        previous_root,
    })
}

/// Returns if already stored content with this digest
pub async fn created_content_exists<C: ConnectionTrait>(
    db: &C,
    digest_type: i32,
    digest_bytes: Vec<u8>,
) -> Result<bool, DbErr> {
    Ok(
        created_content_model::Entity::find_by_id((digest_type, digest_bytes))
            .one(db)
            .await?
            .is_some(),
    )
}

/// Return the content reference, if any, from the database
pub async fn get_content<C: ConnectionTrait>(
    db: &C,
    digest_type: i32,
    digest_bytes: Vec<u8>,
) -> Result<Option<ProcessedContentModel>, DbErr> {
    // Composite primary key: (digest_type, digest_bytes).
    ProcessedContent::find_by_id((digest_type, digest_bytes))
        .one(db)
        .await
}

/// Insert a new row in the `PENDING` state, before processing begins.
pub async fn create_pending<C: ConnectionTrait>(
    db: &C,
    digest_type: i32,
    digest_bytes: Vec<u8>,
) -> Result<ProcessedContentModel, DbErr> {
    ActiveModel {
        digest_type: Set(digest_type),
        digest_bytes: Set(digest_bytes),
        created_at: Set(OffsetDateTime::now_utc()),
        updated_at: Set(OffsetDateTime::now_utc()),
        status: Set(Status::Pending),
        is_csam: Set(None),
        azure_response: Set(None),
    }
    .insert(db)
    .await
}

/// Store a successful Azure result, moving the row to `SUCCESS`.
pub async fn store_azure_result<C: ConnectionTrait>(
    db: &C,
    digest_type: i32,
    digest_bytes: Vec<u8>,
    azure_response: serde_json::Value,
) -> Result<ProcessedContentModel, DbErr> {
    ActiveModel {
        digest_type: Set(digest_type),
        digest_bytes: Set(digest_bytes),
        created_at: NotSet,
        updated_at: Set(OffsetDateTime::now_utc()),
        status: Set(Status::Success),
        is_csam: Set(Some(false)),
        azure_response: Set(Some(azure_response)),
    }
    .update(db)
    .await
}

/// Mark content as CSAM, moving the row to `SUCCESS` with `is_csam = true`.
/// Used when PhotoDNA matches before Azure runs, so `azure_response` stays empty
pub async fn mark_csam<C: ConnectionTrait>(
    db: &C,
    digest_type: i32,
    digest_bytes: Vec<u8>,
) -> Result<ProcessedContentModel, DbErr> {
    ActiveModel {
        digest_type: Set(digest_type),
        digest_bytes: Set(digest_bytes),
        created_at: NotSet,
        updated_at: Set(OffsetDateTime::now_utc()),
        status: Set(Status::Success),
        is_csam: Set(Some(true)),
        azure_response: NotSet,
    }
    .update(db)
    .await
}

/// Mark an existing row as `FAILED` (e.g. the provider call errored).
pub async fn mark_failed<C: ConnectionTrait>(
    db: &C,
    digest_type: i32,
    digest_bytes: Vec<u8>,
) -> Result<ProcessedContentModel, DbErr> {
    ActiveModel {
        digest_type: Set(digest_type),
        digest_bytes: Set(digest_bytes),
        created_at: NotSet,
        updated_at: Set(OffsetDateTime::now_utc()),
        status: Set(Status::Failed),
        is_csam: NotSet,
        azure_response: NotSet,
    }
    .update(db)
    .await
}
