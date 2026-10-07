use sea_orm::entity::prelude::*;

/// One migrated legacy event and the v2 event it was re-signed into. Kept so the
/// migration can run repeatedly: it records what has already been migrated and
/// lets later passes reference a legacy event's new v2 coordinates.
#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "migrated_event")]
pub struct Model {
    /// Legacy system key (hex) that authored the event.
    #[sea_orm(primary_key, auto_increment = false)]
    pub legacy_system_key: String,
    /// Legacy event pointer within the system: `hex(process):logical_clock`.
    #[sea_orm(primary_key, auto_increment = false)]
    pub legacy_pointer: String,
    /// The v2 identity the event was migrated under.
    pub identity: String,
    /// v2 collection the event was authored in.
    pub collection: i32,
    /// v2 sequence assigned within that collection.
    pub sequence: i64,
    /// v2 event signature (hex).
    pub signature: String,
    /// Legacy v1 `ContentType` of the source event.
    pub content_type: i64,
    /// v2 content digest - the key the moderation service dedupes on, so a
    /// moderation seed can find this content.
    pub content_digest_type: Option<i32>,
    pub content_digest_bytes: Option<Vec<u8>>,
    /// The legacy server's moderation verdict (e.g. `approved`,
    /// `flagged_and_rejected`), so the new moderation service can skip re-scoring.
    pub moderation_status: Option<String>,
    /// The legacy `(category, level)` moderation tags (Postgres text form).
    pub moderation_tags: Option<String>,
    pub created_at: TimeDateTimeWithTimeZone,
    pub updated_at: TimeDateTimeWithTimeZone,
}

impl ActiveModelBehavior for ActiveModel {}
