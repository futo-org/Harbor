//! Read/write access to the `migrated_identity` and `migrated_event` tables.

use grayjay_migrator_entity::migrated_event_model as event_model;
use grayjay_migrator_entity::migrated_identity_model as model;
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr,
    EntityTrait, QueryFilter, Statement,
};
use std::collections::{HashMap, HashSet};
use time::OffsetDateTime;

/// Link previews, resolved once per URL across runs.
const URL_CACHE: &str = "url_info_cache";

/// Load all cached `(url, title, description, image)` link previews.
pub async fn load_url_cache(
    db: &DatabaseConnection,
) -> Result<Vec<(String, String, String, String)>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_string(
            DatabaseBackend::Postgres,
            format!("SELECT url, title, description, image FROM {URL_CACHE}"),
        ))
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push((
            row.try_get("", "url")?,
            row.try_get("", "title")?,
            row.try_get("", "description")?,
            row.try_get("", "image")?,
        ));
    }
    Ok(out)
}

/// Persist many link previews in as few statements as possible (idempotent).
/// Rows are `(url, title, description, image)`.
pub async fn insert_url_cache_many(
    db: &DatabaseConnection,
    rows: &[(String, String, String, String)],
) -> Result<(), DbErr> {
    if rows.is_empty() {
        return Ok(());
    }
    // 4 params/row; keep well under Postgres' 65535 cap.
    for chunk in rows.chunks(10_000) {
        let mut placeholders = String::new();
        let mut values: Vec<sea_orm::Value> = Vec::with_capacity(chunk.len() * 4);
        for (i, (url, title, description, image)) in chunk.iter().enumerate() {
            if i > 0 {
                placeholders.push(',');
            }
            let b = i * 4;
            placeholders.push_str(&format!("(${},${},${},${})", b + 1, b + 2, b + 3, b + 4));
            values.push(url.clone().into());
            values.push(title.clone().into());
            values.push(description.clone().into());
            values.push(image.clone().into());
        }
        db.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "INSERT INTO {URL_CACHE} (url, title, description, image) VALUES {placeholders} \
                 ON CONFLICT (url) DO NOTHING"
            ),
            values,
        ))
        .await?;
    }
    Ok(())
}

/// A v2 event authored for a migrated legacy event.
pub struct AuthoredEventRow<'a> {
    pub legacy_system_key_hex: &'a str,
    pub legacy_pointer: &'a str,
    pub identity: &'a str,
    pub collection: i32,
    pub sequence: i64,
    pub signature_hex: &'a str,
    pub content_type: i64,
    pub content_digest_type: i32,
    pub content_digest_bytes: &'a [u8],
    pub moderation_status: Option<&'a str>,
    pub moderation_tags: Option<&'a str>,
}

/// Insert/update many migrated events in as few statements as possible. Chunked
/// to stay under Postgres' parameter limit. One system's events become one (or
/// a few) round trips instead of one per event.
pub async fn upsert_events(
    db: &DatabaseConnection,
    rows: Vec<AuthoredEventRow<'_>>,
) -> Result<(), DbErr> {
    if rows.is_empty() {
        return Ok(());
    }
    let now = OffsetDateTime::now_utc();
    // ~8 columns/row; keep well under the 65535-param cap.
    for chunk in rows.chunks(1000) {
        let actives: Vec<event_model::ActiveModel> = chunk
            .iter()
            .map(|row| event_model::ActiveModel {
                legacy_system_key: Set(row.legacy_system_key_hex.to_string()),
                legacy_pointer: Set(row.legacy_pointer.to_string()),
                identity: Set(row.identity.to_string()),
                collection: Set(row.collection),
                sequence: Set(row.sequence),
                signature: Set(row.signature_hex.to_string()),
                content_type: Set(row.content_type),
                content_digest_type: Set(Some(row.content_digest_type)),
                content_digest_bytes: Set(Some(row.content_digest_bytes.to_vec())),
                moderation_status: Set(row.moderation_status.map(str::to_string)),
                moderation_tags: Set(row.moderation_tags.map(str::to_string)),
                created_at: Set(now),
                updated_at: Set(now),
            })
            .collect();
        event_model::Entity::insert_many(actives)
            .on_conflict(
                OnConflict::columns([
                    event_model::Column::LegacySystemKey,
                    event_model::Column::LegacyPointer,
                ])
                .update_columns([
                    event_model::Column::Identity,
                    event_model::Column::Collection,
                    event_model::Column::Sequence,
                    event_model::Column::Signature,
                    event_model::Column::ContentType,
                    event_model::Column::ContentDigestType,
                    event_model::Column::ContentDigestBytes,
                    event_model::Column::ModerationStatus,
                    event_model::Column::ModerationTags,
                    event_model::Column::UpdatedAt,
                ])
                .to_owned(),
            )
            .exec(db)
            .await?;
    }
    Ok(())
}

/// Batch insert `pending` identity rows in as few statements as possible,
/// instead of one round trip per system. `created_at` is preserved on conflict.
pub async fn upsert_pending_many(
    db: &DatabaseConnection,
    rows: &[(String, i64, String)], // (legacy_system_key_hex, key_type, identity)
) -> Result<(), DbErr> {
    if rows.is_empty() {
        return Ok(());
    }
    let now = OffsetDateTime::now_utc();
    for chunk in rows.chunks(1000) {
        let actives: Vec<model::ActiveModel> = chunk
            .iter()
            .map(|(key_hex, key_type, identity)| model::ActiveModel {
                legacy_system_key: Set(key_hex.clone()),
                legacy_key_type: Set(*key_type),
                identity: Set(identity.clone()),
                status: Set("pending".to_string()),
                created_at: Set(now),
                updated_at: Set(now),
            })
            .collect();
        model::Entity::insert_many(actives)
            .on_conflict(
                OnConflict::column(model::Column::LegacySystemKey)
                    .update_columns([
                        model::Column::LegacyKeyType,
                        model::Column::Identity,
                        model::Column::Status,
                        model::Column::UpdatedAt,
                    ])
                    .to_owned(),
            )
            .exec(db)
            .await?;
    }
    Ok(())
}

/// Look up the v2 identity previously created for a legacy system key (hex of
/// the raw key bytes). Returns `None` if that system has not been migrated.
pub async fn identity_for_legacy_key(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
) -> Result<Option<String>, DbErr> {
    Ok(model::Entity::find_by_id(legacy_system_key_hex.to_string())
        .one(db)
        .await?
        .map(|row| row.identity))
}

/// Insert or update the mapping for a legacy system. Idempotent: re-running the
/// migration for the same system overwrites `identity`/`status`.
pub async fn upsert(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
    legacy_key_type: i64,
    identity: &str,
    status: &str,
) -> Result<(), DbErr> {
    let now = OffsetDateTime::now_utc();
    let active = model::ActiveModel {
        legacy_system_key: Set(legacy_system_key_hex.to_string()),
        legacy_key_type: Set(legacy_key_type),
        identity: Set(identity.to_string()),
        status: Set(status.to_string()),
        created_at: Set(now),
        updated_at: Set(now),
    };
    // Single INSERT ... ON CONFLICT DO UPDATE (one round trip); `created_at`
    // is preserved on re-runs.
    model::Entity::insert(active)
        .on_conflict(
            OnConflict::column(model::Column::LegacySystemKey)
                .update_columns([
                    model::Column::LegacyKeyType,
                    model::Column::Identity,
                    model::Column::Status,
                    model::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec(db)
        .await?;
    Ok(())
}

/// A migrated post that carried a legacy moderation verdict, for seeding the
/// moderation service's `processed_content`.
pub struct SeedRow {
    pub digest_type: i32,
    pub digest_bytes: Vec<u8>,
    pub moderation_status: String,
    /// JSON `[{name,level}]` or `None`.
    pub moderation_tags: Option<String>,
}

/// Migrated events with an actionable legacy moderation verdict and a recorded
/// content digest - the rows worth seeding into `processed_content`.
pub async fn moderated_events(db: &DatabaseConnection) -> Result<Vec<SeedRow>, DbErr> {
    Ok(event_model::Entity::find()
        .filter(event_model::Column::ContentDigestType.is_not_null())
        .filter(event_model::Column::ModerationStatus.is_in(["approved", "flagged_and_rejected"]))
        .all(db)
        .await?
        .into_iter()
        .filter_map(|row| {
            Some(SeedRow {
                digest_type: row.content_digest_type?,
                digest_bytes: row.content_digest_bytes?,
                moderation_status: row.moderation_status?,
                moderation_tags: row.moderation_tags,
            })
        })
        .collect())
}

/// Update just the status of a migrated system (e.g. `signed` -> `complete`).
pub async fn mark_status(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
    status: &str,
) -> Result<(), DbErr> {
    db.execute_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "UPDATE migrated_identity SET status = $2, updated_at = now() \
         WHERE legacy_system_key = $1",
        [legacy_system_key_hex.into(), status.into()],
    ))
    .await?;
    Ok(())
}

/// Authored `EventBundle` bytes per system in push order (`ord`), so `push`
/// sends what `re-sign` produced without re-signing.
const BUNDLE_TABLE: &str = "authored_bundle";

/// Append encoded `EventBundle` bytes after a system's existing bundles, as
/// unpushed (ords continue from the current max).
pub async fn append_bundles(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
    bundles: &[Vec<u8>],
) -> Result<(), DbErr> {
    if bundles.is_empty() {
        return Ok(());
    }
    let rows = db
        .query_all_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "SELECT COALESCE(MAX(ord), -1) + 1 AS next FROM {BUNDLE_TABLE} \
                 WHERE legacy_system_key = $1"
            ),
            [legacy_system_key_hex.into()],
        ))
        .await?;
    let start: i32 = rows
        .first()
        .map(|r| r.try_get::<i32>("", "next"))
        .transpose()?
        .unwrap_or(0);

    // 3 params/row; keep well under the 65535-param cap.
    for (chunk_i, rows) in bundles.chunks(5_000).enumerate() {
        let base_ord = start as usize + chunk_i * 5_000;
        let mut placeholders = String::new();
        let mut values: Vec<sea_orm::Value> = Vec::with_capacity(rows.len() * 3);
        for (i, bundle) in rows.iter().enumerate() {
            if i > 0 {
                placeholders.push(',');
            }
            let b = i * 3;
            placeholders.push_str(&format!("(${},${},${})", b + 1, b + 2, b + 3));
            values.push(legacy_system_key_hex.into());
            values.push(((base_ord + i) as i32).into());
            values.push(bundle.clone().into());
        }
        db.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "INSERT INTO {BUNDLE_TABLE} (legacy_system_key, ord, bundle) VALUES {placeholders}"
            ),
            values,
        ))
        .await?;
    }
    Ok(())
}

/// Systems with events awaiting push (`(legacy_system_key_hex, identity)`).
pub async fn signed_systems(db: &DatabaseConnection) -> Result<Vec<(String, String)>, DbErr> {
    Ok(model::Entity::find()
        .filter(model::Column::Status.eq("signed"))
        .all(db)
        .await?
        .into_iter()
        .map(|row| (row.legacy_system_key, row.identity))
        .collect())
}

/// Load a system's **unpushed** bundle bytes, in push order.
pub async fn load_unpushed_bundles(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
) -> Result<Vec<Vec<u8>>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "SELECT bundle FROM {BUNDLE_TABLE} \
                 WHERE legacy_system_key = $1 AND NOT pushed ORDER BY ord"
            ),
            [legacy_system_key_hex.into()],
        ))
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(row.try_get::<Vec<u8>>("", "bundle")?);
    }
    Ok(out)
}

/// Mark all of a system's bundles pushed (after a successful push).
pub async fn mark_bundles_pushed(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
) -> Result<(), DbErr> {
    db.execute_raw(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        format!(
            "UPDATE {BUNDLE_TABLE} SET pushed = true WHERE legacy_system_key = $1 AND NOT pushed"
        ),
        [legacy_system_key_hex.into()],
    ))
    .await?;
    Ok(())
}

/// One persisted chain row: `(collection, last_sequence, last_signature, merkle_peaks)`.
pub type ChainRow = (i32, u64, Vec<u8>, Vec<u8>);

/// Each system's resumable chain state, so a later run appends onto the
/// existing chain.
const CHAIN_TABLE: &str = "migrated_chain";

/// Load every system's chain rows, grouped by legacy key:
/// `key_hex -> [(collection, last_sequence, last_signature, merkle_peaks)]`.
pub async fn all_chains(db: &DatabaseConnection) -> Result<HashMap<String, Vec<ChainRow>>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_string(
            DatabaseBackend::Postgres,
            format!(
                "SELECT legacy_system_key, collection, last_sequence, last_signature, merkle_peaks \
                 FROM {CHAIN_TABLE}"
            ),
        ))
        .await?;
    let mut out: HashMap<String, Vec<ChainRow>> = HashMap::new();
    for row in rows {
        let key: String = row.try_get("", "legacy_system_key")?;
        let collection: i32 = row.try_get("", "collection")?;
        let last_sequence: i64 = row.try_get("", "last_sequence")?;
        let last_signature: Vec<u8> = row.try_get("", "last_signature")?;
        let merkle_peaks: Vec<u8> = row.try_get("", "merkle_peaks")?;
        out.entry(key).or_default().push((
            collection,
            last_sequence as u64,
            last_signature,
            merkle_peaks,
        ));
    }
    Ok(out)
}

/// Upsert a system's chain rows (`(collection, last_sequence, last_signature, merkle_peaks)`).
pub async fn upsert_chains(
    db: &DatabaseConnection,
    legacy_system_key_hex: &str,
    rows: &[ChainRow],
) -> Result<(), DbErr> {
    for (collection, last_sequence, last_signature, merkle_peaks) in rows {
        db.execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "INSERT INTO {CHAIN_TABLE} \
                   (legacy_system_key, collection, last_sequence, last_signature, merkle_peaks) \
                 VALUES ($1, $2, $3, $4, $5) \
                 ON CONFLICT (legacy_system_key, collection) DO UPDATE SET \
                   last_sequence = EXCLUDED.last_sequence, \
                   last_signature = EXCLUDED.last_signature, \
                   merkle_peaks = EXCLUDED.merkle_peaks"
            ),
            [
                legacy_system_key_hex.into(),
                (*collection).into(),
                (*last_sequence as i64).into(),
                last_signature.clone().into(),
                merkle_peaks.clone().into(),
            ],
        ))
        .await?;
    }
    Ok(())
}

/// Every legacy pointer already migrated, so `re-sign` authors only new events.
pub async fn all_migrated_pointers(db: &DatabaseConnection) -> Result<HashSet<String>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_string(
            DatabaseBackend::Postgres,
            "SELECT legacy_pointer FROM migrated_event".to_string(),
        ))
        .await?;
    let mut out = HashSet::with_capacity(rows.len());
    for row in rows {
        out.insert(row.try_get::<String>("", "legacy_pointer")?);
    }
    Ok(out)
}

/// Every already-migrated FEED (post) event, for resolving replies to posts
/// migrated on an earlier run: `(legacy_system_key, legacy_pointer, identity, sequence)`.
pub async fn migrated_feed_events(
    db: &DatabaseConnection,
    feed_collection: i32,
) -> Result<Vec<(String, String, String, i64)>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT legacy_system_key, legacy_pointer, identity, sequence \
             FROM migrated_event WHERE collection = $1"
                .to_string(),
            [feed_collection.into()],
        ))
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push((
            row.try_get::<String>("", "legacy_system_key")?,
            row.try_get::<String>("", "legacy_pointer")?,
            row.try_get::<String>("", "identity")?,
            row.try_get::<i64>("", "sequence")?,
        ));
    }
    Ok(out)
}
