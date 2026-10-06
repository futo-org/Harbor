//! Read-only access to the legacy (v1) server's Postgres.
//!
//! IMPORTANT: the exact table/column names below must match srv1-gj's schema.
//! They are isolated here as constants so they are the only thing to confirm
//! against the live database. The classic Polycentric server stores each event
//! as a serialized v1 `SignedEvent` blob; we decode that to a v1 `Event` and
//! never trust anything but the raw bytes, so coupling to the schema is minimal:
//! we only need to enumerate systems and pull each system's raw events.

use futures::TryStreamExt;
use polycentric_common::models::protos::{
    Event as LegacyEventProto, Pointer as LegacyPointer, PublicKey as LegacyPublicKey,
    SignedEvent as LegacySignedEvent,
};
use prost::Message;
use sea_orm::{
    ConnectOptions, ConnectionTrait, Database, DatabaseBackend, DatabaseConnection, DbErr,
    Statement, StreamTrait, TryGetable,
};
use std::collections::HashMap;

/// Table holding serialized v1 events.
const EVENTS_TABLE: &str = "events";
/// Column: v1 `PublicKey.key_type` of the authoring system.
const COL_SYSTEM_KEY_TYPE: &str = "system_key_type";
/// Column: v1 `PublicKey.key` bytes of the authoring system.
const COL_SYSTEM_KEY: &str = "system_key";
/// Column: the serialized v1 `SignedEvent` bytes.
const COL_RAW_EVENT: &str = "raw_event";
/// Column: the server's moderation verdict enum.
const COL_MODERATION_STATUS: &str = "moderation_status";
/// Column: array of `(category, level)` moderation tags.
const COL_MODERATION_TAGS: &str = "moderation_tags";

/// A legacy system (its v1 public key).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LegacySystem {
    pub key_type: i64,
    pub key: Vec<u8>,
}

impl LegacySystem {
    /// Lowercase hex of the raw key bytes - the mapping table key and the HTTP
    /// lookup path parameter.
    pub fn key_hex(&self) -> String {
        hex::encode(&self.key)
    }
}

/// A decoded v1 follow (`content_type=FOLLOW`): the followed system and the
/// add/remove state, resolved latest-wins per followed system in [`crate::convert`].
#[derive(Clone, Debug)]
pub struct FollowRef {
    /// The followed system's raw ed25519 key.
    pub followed_key: Vec<u8>,
    /// True = follow (ADD), false = unfollow (REMOVE).
    pub add: bool,
    /// LWW timestamp of the follow/unfollow.
    pub unix_ms: u64,
}

/// A v1 reference carried on an event (the topic a post/opinion is about).
#[derive(Clone, Debug)]
pub struct LegacyReference {
    /// v1 `Reference.ReferenceType` (0 Unknown, 1 System, 2 Pointer, 3 Bytes).
    pub reference_type: i64,
    pub reference: Vec<u8>,
}

/// v1 `Reference.ReferenceType::Pointer` - the reference bytes are a v1 `Pointer`.
const REF_POINTER: i64 = 2;

/// v1 `ContentType::FOLLOW`.
const CT_FOLLOW: i64 = 4;

/// A reference to another legacy event (e.g. the parent a reply points at),
/// identified the same way as [`LegacyEvent::pointer`] but with the target's
/// authoring system.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TargetPointer {
    /// Hex of the target's authoring system key.
    pub system_hex: String,
    /// `hex(process):logical_clock` of the target event.
    pub pointer: String,
}

/// A decoded v1 event with the fields the migrator maps from.
pub struct LegacyEvent {
    pub content_type: i64,
    pub content: Vec<u8>,
    pub unix_milliseconds: u64,
    /// v1 CRDT single-value payload (`LWWElement.value`): username/description
    /// and the opinion (like/dislike/neutral) value live here, not in `content`.
    pub lww_value: Option<Vec<u8>>,
    /// What this event references - for Grayjay, the URL/topic a post is a
    /// comment on, or the target of a reaction.
    pub references: Vec<LegacyReference>,
    /// Decoded follow, present only for `content_type=FOLLOW`.
    pub follow: Option<FollowRef>,
    /// The authoring process (v1 `Process.process`).
    pub process: Vec<u8>,
    pub logical_clock: u64,
    /// The legacy server's moderation verdict (e.g. `approved`,
    /// `flagged_and_rejected`), carried forward so the new moderation service can
    /// avoid re-scoring already-moderated content.
    pub moderation_status: Option<String>,
    /// The legacy `(category, level)` moderation tags as JSON, e.g.
    /// `[{"name":"hate","level":0},{"name":"self_harm","level":1}]`.
    pub moderation_tags: Option<String>,
}

impl LegacyEvent {
    /// Stable identifier for this legacy event within its system:
    /// `hex(process):logical_clock`. Used as the mapping key so re-runs can
    /// find events already migrated.
    pub fn pointer(&self) -> String {
        format!("{}:{}", hex::encode(&self.process), self.logical_clock)
    }

    /// The event this one points at via a v1 `Pointer` reference - for a reply,
    /// the parent post. Returns the first decodable pointer reference.
    pub fn pointer_target(&self) -> Option<TargetPointer> {
        self.references
            .iter()
            .filter(|r| r.reference_type == REF_POINTER)
            .find_map(|r| {
                let p = LegacyPointer::decode(r.reference.as_slice()).ok()?;
                let system = p.system?;
                let process = p.process?;
                Some(TargetPointer {
                    system_hex: hex::encode(&system.key),
                    pointer: format!("{}:{}", hex::encode(&process.process), p.logical_clock),
                })
            })
    }
}

/// Connect (read-only) to the legacy database.
pub async fn connect(url: &str) -> Result<DatabaseConnection, DbErr> {
    let mut opt = ConnectOptions::new(url.to_string());
    // Each worker issues its events + opinions reads concurrently (2 in flight),
    // so size the pool at ~2x concurrency plus headroom.
    opt.max_connections((crate::config::get().concurrency as u32) * 2 + 4);
    // Per-statement logging would flood the migration (and the progress bars).
    opt.sqlx_logging(false);
    Database::connect(opt).await
}

/// v1 `ContentType::OPINION`. Opinions are the bulk of the data (tens of
/// millions); they are read pre-deduplicated from the server's
/// `lww_element_latest_reference_*` tables (see [`opinions_for_system`]) instead
/// of scanning and protobuf-decoding every one here.
const CT_OPINION: i64 = 14;

/// The v1 content types the migrator actually maps to v2 content, as a SQL
/// list. Using a positive `IN (...)` (rather than `<> 14`) is *sargable* on the
/// `(system_key_type, system_key, content_type)` index, so it reads only these
/// rows instead of scanning (and discarding) a heavy voter's tens of thousands
/// of opinion rows. Keep in sync with the arms of [`crate::convert::plan`]:
/// POST(3), FOLLOW(4), USERNAME(5), DESCRIPTION(6).
const MIGRATED_CONTENT_TYPES: &str = "3,4,5,6";

// Local copies of the legacy rows (the legacy DB is remote and near its
// connection limit). Created by the crate's migrations.
const EVENTS_CACHE: &str = "legacy_events_cache";
const OPINIONS_CACHE: &str = "legacy_opinions_cache";

/// Insert a batch of pre-flattened rows into `table` (`cols` columns each).
async fn flush_batch(
    local: &DatabaseConnection,
    table: &str,
    columns: &str,
    cols: usize,
    params: &mut Vec<sea_orm::Value>,
) -> Result<(), DbErr> {
    if params.is_empty() {
        return Ok(());
    }
    let rows = params.len() / cols;
    let mut placeholders = String::new();
    for r in 0..rows {
        if r > 0 {
            placeholders.push(',');
        }
        placeholders.push('(');
        for c in 0..cols {
            if c > 0 {
                placeholders.push(',');
            }
            placeholders.push_str(&format!("${}", r * cols + c + 1));
        }
        placeholders.push(')');
    }
    let sql = format!("INSERT INTO {table} ({columns}) VALUES {placeholders}");
    local
        .execute_raw(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            sql,
            std::mem::take(params),
        ))
        .await?;
    Ok(())
}

/// Copy the rows the migrator needs from the remote legacy DB into the local
/// cache tables (one big streamed scan each). Run once before migrating.
pub async fn sync_to_cache(
    remote: &DatabaseConnection,
    local: &DatabaseConnection,
    mut on_events: impl FnMut(u64),
    mut on_opinions: impl FnMut(u64),
) -> Result<(), DbErr> {
    local
        .execute_unprepared(&format!("TRUNCATE {EVENTS_CACHE}"))
        .await?;
    local
        .execute_unprepared(&format!("TRUNCATE {OPINIONS_CACHE}"))
        .await?;

    // --- events (posts/profiles) ---
    let ev_sql = format!(
        "SELECT {COL_SYSTEM_KEY} AS sk, {COL_RAW_EVENT} AS raw, \
                {COL_MODERATION_STATUS}::text AS moderation_status, \
                to_jsonb({COL_MODERATION_TAGS})::text AS moderation_tags \
         FROM {EVENTS_TABLE} \
         WHERE {COL_SYSTEM_KEY_TYPE} = 1 AND content_type IN ({MIGRATED_CONTENT_TYPES})"
    );
    {
        let mut stream = remote
            .stream_raw(Statement::from_string(DatabaseBackend::Postgres, ev_sql))
            .await?;
        let mut params: Vec<sea_orm::Value> = Vec::new();
        let mut seen = 0u64;
        let mut batch = 0usize;
        while let Some(row) = stream.try_next().await? {
            let sk: Vec<u8> = row.try_get("", "sk")?;
            let raw: Vec<u8> = row.try_get("", "raw")?;
            let ms: Option<String> = row.try_get("", "moderation_status")?;
            let mt: Option<String> = row.try_get("", "moderation_tags")?;
            params.push(sk.into());
            params.push(raw.into());
            params.push(ms.into());
            params.push(mt.into());
            batch += 1;
            if batch >= 1000 {
                flush_batch(
                    local,
                    EVENTS_CACHE,
                    "system_key, raw_event, moderation_status, moderation_tags",
                    4,
                    &mut params,
                )
                .await?;
                seen += batch as u64;
                on_events(seen);
                batch = 0;
            }
        }
        flush_batch(
            local,
            EVENTS_CACHE,
            "system_key, raw_event, moderation_status, moderation_tags",
            4,
            &mut params,
        )
        .await?;
        seen += batch as u64;
        on_events(seen);
    }

    // --- opinions (deduplicated latest per target) ---
    let op_sql = format!(
        "SELECT 'b' AS kind, r.{COL_SYSTEM_KEY} AS sk, le.value AS value, \
                r.lww_element_unix_milliseconds AS ts, r.subject AS subject, \
                NULL::bytea AS t_system_key, NULL::bytea AS t_process, \
                NULL::bigint AS t_logical_clock \
         FROM lww_element_latest_reference_bytes r \
         JOIN lww_elements le ON le.event_id = r.event_id \
         WHERE r.content_type = {CT_OPINION} AND r.{COL_SYSTEM_KEY_TYPE} = 1 \
         UNION ALL \
         SELECT 'p' AS kind, r.{COL_SYSTEM_KEY} AS sk, le.value AS value, \
                r.lww_element_unix_milliseconds AS ts, NULL::bytea AS subject, \
                r.subject_system_key AS t_system_key, r.subject_process AS t_process, \
                r.subject_logical_clock AS t_logical_clock \
         FROM lww_element_latest_reference_pointer r \
         JOIN lww_elements le ON le.event_id = r.event_id \
         WHERE r.content_type = {CT_OPINION} AND r.{COL_SYSTEM_KEY_TYPE} = 1"
    );
    {
        let mut stream = remote
            .stream_raw(Statement::from_string(DatabaseBackend::Postgres, op_sql))
            .await?;
        let mut params: Vec<sea_orm::Value> = Vec::new();
        let mut seen = 0u64;
        let mut batch = 0usize;
        while let Some(row) = stream.try_next().await? {
            let kind: String = row.try_get("", "kind")?;
            let sk: Vec<u8> = row.try_get("", "sk")?;
            let value: Vec<u8> = row.try_get("", "value")?;
            let ts = get_i64(&row, "ts")?;
            let subject: Option<Vec<u8>> = row.try_get("", "subject")?;
            let tsk: Option<Vec<u8>> = row.try_get("", "t_system_key")?;
            let tp: Option<Vec<u8>> = row.try_get("", "t_process")?;
            let tlc: Option<i64> = row.try_get("", "t_logical_clock")?;
            params.push(kind.into());
            params.push(sk.into());
            params.push(value.into());
            params.push(ts.into());
            params.push(subject.into());
            params.push(tsk.into());
            params.push(tp.into());
            params.push(tlc.into());
            batch += 1;
            if batch >= 1000 {
                flush_batch(local, OPINIONS_CACHE, OPINION_CACHE_COLS, 8, &mut params).await?;
                seen += batch as u64;
                on_opinions(seen);
                batch = 0;
            }
        }
        flush_batch(local, OPINIONS_CACHE, OPINION_CACHE_COLS, 8, &mut params).await?;
        seen += batch as u64;
        on_opinions(seen);
    }

    Ok(())
}

const OPINION_CACHE_COLS: &str =
    "kind, system_key, value, ts, subject, t_system_key, t_process, t_logical_clock";

/// Enumerate every cached system (any that has a cached post/profile or
/// opinion). All cached systems are key_type 1.
pub async fn cached_list_systems(local: &DatabaseConnection) -> Result<Vec<LegacySystem>, DbErr> {
    let sql = format!(
        "SELECT system_key AS key FROM {EVENTS_CACHE} \
         UNION SELECT system_key AS key FROM {OPINIONS_CACHE}"
    );
    let rows = local
        .query_all_raw(Statement::from_string(DatabaseBackend::Postgres, sql))
        .await?;
    let mut systems = Vec::with_capacity(rows.len());
    for row in rows {
        systems.push(LegacySystem {
            key_type: 1,
            key: row.try_get::<Vec<u8>>("", "key")?,
        });
    }
    Ok(systems)
}

/// Load every cached system's mapped events, grouped by system key, oldest
/// first. Reads the **local** cache (populated by [`sync_to_cache`]).
pub async fn load_events_by_system(
    local: &DatabaseConnection,
    mut on_progress: impl FnMut(u64),
) -> Result<HashMap<Vec<u8>, Vec<LegacyEvent>>, DbErr> {
    let sql = format!(
        "SELECT system_key AS sk, raw_event AS raw, moderation_status, moderation_tags \
         FROM {EVENTS_CACHE}"
    );
    let mut stream = local
        .stream_raw(Statement::from_string(DatabaseBackend::Postgres, sql))
        .await?;
    let mut map: HashMap<Vec<u8>, Vec<LegacyEvent>> = HashMap::new();
    let mut seen = 0u64;
    while let Some(row) = stream.try_next().await? {
        seen += 1;
        if seen % 50_000 == 0 {
            on_progress(seen);
        }
        let sk: Vec<u8> = row.try_get("", "sk")?;
        let raw: Vec<u8> = row.try_get("", "raw")?;
        let Some(mut event) = decode_event(&raw) else {
            continue;
        };
        event.moderation_status = row.try_get("", "moderation_status")?;
        event.moderation_tags = row
            .try_get::<Option<String>>("", "moderation_tags")?
            .filter(|s| !s.is_empty() && s != "[]" && s != "null");
        map.entry(sk).or_default().push(event);
    }
    for events in map.values_mut() {
        events.sort_by_key(|e| (e.unix_milliseconds, e.logical_clock));
    }
    Ok(map)
}

/// The target an opinion is about.
#[derive(Clone, Debug)]
pub enum OpinionTarget {
    /// A topic URL / bare id (Bytes reference).
    Bytes(Vec<u8>),
    /// An in-network event (Pointer reference), e.g. a post being voted on.
    Pointer(TargetPointer),
}

/// One system's *already-deduplicated* latest opinion on a single target. The
/// legacy server maintains `lww_element_latest_reference_{bytes,pointer}` as the
/// last-write-wins winner per (system, target), so we read the winner directly
/// (value + timestamp + target as columns) rather than scanning every opinion.
#[derive(Clone, Debug)]
pub struct LegacyOpinion {
    /// The `LWWElement.value` (the `Opinion` enum byte).
    pub value: Vec<u8>,
    pub unix_milliseconds: u64,
    pub target: OpinionTarget,
}

impl LegacyOpinion {
    /// A stable, unique-per-system identifier for this opinion, used as the
    /// `migrated_event` idempotency key. There is exactly one (kept) opinion per
    /// (system, target), so the target itself is a stable key - and deriving it
    /// from the target (rather than the winning event's `process:logical_clock`)
    /// avoids an extra join back to `events`.
    pub fn source_pointer(&self) -> String {
        match &self.target {
            OpinionTarget::Bytes(bytes) => format!("op:b:{}", hex::encode(bytes)),
            OpinionTarget::Pointer(t) => format!("op:p:{}:{}", t.system_hex, t.pointer),
        }
    }
}

/// Load every cached system's deduplicated opinions, grouped by system key.
/// Reads the **local** cache (populated by [`sync_to_cache`]).
pub async fn load_opinions_by_system(
    local: &DatabaseConnection,
    mut on_progress: impl FnMut(u64),
) -> Result<HashMap<Vec<u8>, Vec<LegacyOpinion>>, DbErr> {
    let sql = format!(
        "SELECT kind, system_key AS sk, value, ts, subject, \
                t_system_key, t_process, t_logical_clock \
         FROM {OPINIONS_CACHE}"
    );
    let mut stream = local
        .stream_raw(Statement::from_string(DatabaseBackend::Postgres, sql))
        .await?;
    let mut map: HashMap<Vec<u8>, Vec<LegacyOpinion>> = HashMap::new();
    let mut seen = 0u64;
    while let Some(row) = stream.try_next().await? {
        seen += 1;
        if seen % 200_000 == 0 {
            on_progress(seen);
        }
        let sk: Vec<u8> = row.try_get("", "sk")?;
        let value: Vec<u8> = row.try_get("", "value")?;
        let unix_milliseconds = get_i64(&row, "ts")? as u64;
        let kind: String = row.try_get("", "kind")?;
        let target = if kind == "b" {
            OpinionTarget::Bytes(row.try_get("", "subject")?)
        } else {
            let t_system_key: Vec<u8> = row.try_get("", "t_system_key")?;
            let t_process: Vec<u8> = row.try_get("", "t_process")?;
            let t_logical_clock = get_i64(&row, "t_logical_clock")?;
            OpinionTarget::Pointer(TargetPointer {
                system_hex: hex::encode(&t_system_key),
                pointer: format!("{}:{}", hex::encode(&t_process), t_logical_clock),
            })
        };
        map.entry(sk).or_default().push(LegacyOpinion {
            value,
            unix_milliseconds,
            target,
        });
    }
    Ok(map)
}

/// Decode a serialized v1 `SignedEvent` into the fields we migrate.
fn decode_event(raw: &[u8]) -> Option<LegacyEvent> {
    let signed = LegacySignedEvent::decode(raw).ok()?;
    let event = LegacyEventProto::decode(signed.event.as_slice()).ok()?;
    // A follow's target is the followed system, serialized as a PublicKey in the
    // LWWElementSet value (operation 0 = follow, 1 = unfollow).
    let follow = (event.content_type as i64 == CT_FOLLOW)
        .then_some(event.lww_element_set.as_ref())
        .flatten()
        .and_then(|set| {
            let pk = LegacyPublicKey::decode(set.value.as_slice()).ok()?;
            Some(FollowRef {
                followed_key: pk.key,
                add: set.operation == 0,
                unix_ms: set.unix_milliseconds,
            })
        });
    Some(LegacyEvent {
        content_type: event.content_type as i64,
        content: event.content,
        unix_milliseconds: event.unix_milliseconds.unwrap_or(0),
        // Opinions and profile fields are stored in the LWWElement (Event
        // field 9), not the LWWElementSet (field 8).
        lww_value: event.lww_element.map(|e| e.value),
        references: event
            .references
            .into_iter()
            .map(|r| LegacyReference {
                reference_type: r.reference_type as i64,
                reference: r.reference,
            })
            .collect(),
        follow,
        process: event.process.map(|p| p.process).unwrap_or_default(),
        logical_clock: event.logical_clock,
        // Filled from DB columns by the caller.
        moderation_status: None,
        moderation_tags: None,
    })
}

/// The migrated identity lists the legacy system key as a v2 rotation key. Both
/// v1 and v2 use ed25519 (`key_type` 1), so the bytes map across directly. Only
/// ed25519 systems are supported; the caller skips anything else.
pub fn to_v2_public_key(
    system: &LegacySystem,
) -> Option<polycentric_common::models::protos_v2::PublicKey> {
    use polycentric_common::models::protos_v2::{KeyType, PublicKey};
    if system.key_type != 1 {
        return None;
    }
    Some(PublicKey {
        key_type: KeyType::Ed25519 as i32,
        key: system.key.clone(),
    })
}

fn get_i64(row: &sea_orm::QueryResult, col: &str) -> Result<i64, DbErr> {
    // Postgres may report the column as int8/int4; try i64 then i32.
    Ok(i64::try_get(row, "", col).or_else(|_| i32::try_get(row, "", col).map(|v| v as i64))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A real `content_type=14` opinion (a LIKE) captured from srv1-gj. The
    // like value lives in the LWWElement (Event field 9), and its topic is a
    // Bytes reference (type 3) - here a bare YouTube id.
    const OPINION_LIKE_EVENT: &str = "0a4069a8c4c1200c2883b10f905e78e0ccadfd3b367062e2884daff6b360474bf6f15ea76543e45191de73d43f53734c1cbd6643d8ed5635069c4cd6130d53569f05127e0a2408011220357202af15b3304b2c47acb4f9df6d7a4b5e6e01f40081fa39f9e45b6c92911b12120a10a53c2782bf942529fc592598128cc2f11822200e32003a180a04080a10010a04080510020a040803100b0a04080e10214a0a0a010110dcc38af0a831520f0803120b365377303673777467593058dfc38af0a831";

    #[test]
    fn decodes_opinion_from_lww_element() {
        let raw = hex::decode(OPINION_LIKE_EVENT).unwrap();
        let event = decode_event(&raw).expect("decodes");
        assert_eq!(event.content_type, 14, "opinion content type");
        // The like value is carried in the LWWElement, not the LWWElementSet.
        assert_eq!(event.lww_value.as_deref(), Some([1u8].as_slice()));
        // Its topic is a Bytes reference (type 3).
        let topic = event
            .references
            .iter()
            .find(|r| r.reference_type == 3)
            .expect("has a bytes reference");
        assert_eq!(topic.reference, b"6Sw06swtgY0");
    }

    // A real `content_type=4` follow captured from srv1-gj. The followed system
    // is a PublicKey in the LWWElementSet value; no `operation` = ADD (follow).
    const FOLLOW_EVENT: &str = "0a4019883906874f7fd1566dcabfa4e7306149b9f7d8bd5357da8199e282f405c3a1b40ed1a31dbbe46c22ef7f792f0d1a7ff80c0d31a80d7562fca176de8c536009128c010a24080112207d6a96974d7f5cf9fcc16ddbecb5a13f32997f0f40b02f8a8ee8e74c2beab16c12120a10da47c96314d581d63e1efe471a6043cf1804200432020a003a120a04080510010a04080310020a04080e1003422d1224080112207d6a96974d7f5cf9fcc16ddbecb5a13f32997f0f40b02f8a8ee8e74c2beab16c18aae0dca9b23158afe0dca9b231";

    #[test]
    fn decodes_follow_from_lww_element_set() {
        let raw = hex::decode(FOLLOW_EVENT).unwrap();
        let event = decode_event(&raw).expect("decodes");
        assert_eq!(event.content_type, 4, "follow content type");
        let f = event.follow.expect("has a decoded follow");
        assert!(f.add, "no operation = ADD (follow)");
        assert_eq!(
            hex::encode(&f.followed_key),
            "7d6a96974d7f5cf9fcc16ddbecb5a13f32997f0f40b02f8a8ee8e74c2beab16c"
        );
    }
}
