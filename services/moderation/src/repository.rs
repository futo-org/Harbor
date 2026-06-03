use moderation_entity::processed_content_model::{
    ActiveModel, Entity as ProcessedContent, Model as ProcessedContentModel, Status,
};
use sea_orm::{
    ActiveModelTrait, ActiveValue::NotSet, ActiveValue::Set, ConnectionTrait, DbErr, EntityTrait,
    prelude::TimeDateTime, sea_query::value::prelude::serde_json,
};
use time::OffsetDateTime;

/// Current wall-clock time as the `TimeDateTime` (naive) the schema uses.
fn now() -> TimeDateTime {
    let now = OffsetDateTime::now_utc();
    TimeDateTime::new(now.date(), now.time())
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
    let now = now();
    ActiveModel {
        digest_type: Set(digest_type),
        digest_bytes: Set(digest_bytes),
        created_at: Set(now),
        updated_at: Set(now),
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
        updated_at: Set(now()),
        status: Set(Status::Success),
        is_csam: Set(Some(false)),
        azure_response: Set(Some(azure_response)),
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
        updated_at: Set(now()),
        status: Set(Status::Failed),
        is_csam: NotSet,
        azure_response: NotSet,
    }
    .update(db)
    .await
}
