use ::entity::{ban, content, event, moderator};
use polycentric_common::models::collections;
use sea_orm::*;

use crate::data::EventWithContentRow;
use crate::service::feeds::repository::content_join;
use crate::service::identity::chain;
use crate::service::proto::{ContentDigest, Identity, PublicKey};

const IDENTITY_COLLECTION: i16 = collections::IDENTITY as i16;

#[derive(Debug, Clone)]
pub struct AuthorizedKey {
    pub key: PublicKey,
    pub is_rotation_key: bool,
}

/// Keyset position in the banned-identity list, ordered by
/// `(created_at, identity)` descending.
#[derive(Debug, Clone)]
pub struct BanCursor {
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub identity: String,
}

pub struct Query;

impl Query {
    /// Authorized keys for `identity`'s validated chain head.
    pub async fn authorized_keys(
        db: &DbConn,
        identity: &str,
    ) -> Result<Vec<AuthorizedKey>, DbErr> {
        let Some(content) =
            Self::latest_valid_identity_content(db, identity).await?
        else {
            return Ok(vec![]);
        };

        let mut keys = Vec::new();
        for pk in content.rotation_keys {
            keys.push(AuthorizedKey {
                key: pk,
                is_rotation_key: true,
            });
        }
        for pk in content.signing_keys {
            keys.push(AuthorizedKey {
                key: pk,
                is_rotation_key: false,
            });
        }
        Ok(keys)
    }

    /// Fetch an identity's IDENTITY-collection events and return its
    /// validated chain head, or `None` when no valid genesis exists. The
    /// chain walk itself is the pure `chain::validated_chain_head`.
    pub async fn latest_valid_identity_content<C: ConnectionTrait>(
        db: &C,
        identity: &str,
    ) -> Result<Option<Identity>, DbErr> {
        let rows = Self::list_identity_events_for_identities(
            db,
            vec![identity.to_string()],
        )
        .await?;
        Ok(chain::validated_chain_head(identity, &rows))
    }

    /// True when `public_key` is a rotation key on the latest identity state.
    pub async fn is_rotation_key(
        db: &DbConn,
        identity_key: &str,
        public_key: &[u8],
    ) -> Result<bool, DbErr> {
        let authorized_keys = Self::authorized_keys(db, identity_key).await?;
        Ok(authorized_keys
            .iter()
            .any(|k| k.is_rotation_key && k.key.key.as_slice() == public_key))
    }

    /// True when `identity` has a row in the `moderator` table.
    pub async fn is_moderator(
        db: &DbConn,
        identity: &str,
    ) -> Result<bool, DbErr> {
        moderator::Entity::find_by_id(identity).exists(db).await
    }

    /// Number of events `identity` has.
    pub async fn count_events<C: ConnectionTrait>(
        db: &C,
        identity: &str,
    ) -> Result<u64, DbErr> {
        event::Entity::find()
            .filter(event::Column::Identity.eq(identity))
            .count(db)
            .await
    }

    /// Identities with at least one event signed by `public_key`.
    pub async fn identities_signed_by<C: ConnectionTrait>(
        db: &C,
        public_key: &[u8],
    ) -> Result<Vec<String>, DbErr> {
        event::Entity::find()
            .select_only()
            .column(event::Column::Identity)
            .distinct()
            .filter(event::Column::PublicKey.eq(public_key.to_vec()))
            .into_tuple()
            .all(db)
            .await
    }

    /// Number of content rows no event references.
    pub async fn count_orphan_content<C: ConnectionTrait>(
        db: &C,
    ) -> Result<i64, DbErr> {
        let row = db
            .query_one_raw(Statement::from_string(
                DbBackend::Postgres,
                format!(
                    "SELECT count(*) AS n FROM content c WHERE {ORPHAN_CONTENT}"
                ),
            ))
            .await?
            .ok_or_else(|| DbErr::Custom("count returned no row".into()))?;
        row.try_get("", "n")
    }

    /// True when `identity` has a row in the `ban` table.
    pub async fn is_banned<C: ConnectionTrait>(
        db: &C,
        identity: &str,
    ) -> Result<bool, DbErr> {
        ban::Entity::find_by_id(identity).exists(db).await
    }

    /// A page of banned identities, most recently banned first. Ordered
    /// by `(created_at, identity)` descending so the cursor is stable
    /// even when timestamps collide. `after` continues after a previous
    /// page's last row; `query` keeps only identities that begin with it
    /// (case-insensitive prefix). Returns up to `limit` rows.
    pub async fn list_bans(
        db: &DbConn,
        limit: u64,
        after: Option<&BanCursor>,
        query: Option<&str>,
    ) -> Result<Vec<ban::Model>, DbErr> {
        let mut q = ban::Entity::find()
            .order_by_desc(ban::Column::CreatedAt)
            .order_by_desc(ban::Column::Identity)
            .limit(limit);

        if let Some(cursor) = after {
            // Keyset: rows strictly "older" than the cursor in the
            // (created_at, identity) descending order.
            q = q.filter(
                Condition::any()
                    .add(ban::Column::CreatedAt.lt(cursor.created_at))
                    .add(
                        Condition::all()
                            .add(ban::Column::CreatedAt.eq(cursor.created_at))
                            .add(
                                ban::Column::Identity
                                    .lt(cursor.identity.clone()),
                            ),
                    ),
            );
        }

        if let Some(query) = query {
            q = q.filter(ban::Column::Identity.starts_with(query));
        }

        q.all(db).await
    }

    /// Every IDENTITY-collection event (full chain) for each of
    /// `identities`. Sent as hints on feed/thread/list responses so
    /// clients can validate post authors without re-fetching the chain.
    pub async fn list_identity_events_for_identities<C: ConnectionTrait>(
        db: &C,
        identities: Vec<String>,
    ) -> Result<Vec<EventWithContentRow>, DbErr> {
        if identities.is_empty() {
            return Ok(Vec::new());
        }
        event::Entity::find()
            .select_also(content::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(event::Column::Collection.eq(IDENTITY_COLLECTION))
            .filter(event::Column::Identity.is_in(identities))
            .order_by_asc(event::Column::Sequence)
            .all(db)
            .await
    }
}

pub struct Mutation;

impl Mutation {
    /// Sets whether `identity` is banned: inserts or deletes its `ban`
    /// row. When banning, records `banned_by` as the issuing moderator.
    /// Idempotent in both directions.
    pub async fn set_banned<C: ConnectionTrait>(
        db: &C,
        identity: &str,
        banned: bool,
        banned_by: &str,
    ) -> Result<(), DbErr> {
        if banned {
            let now = chrono::Utc::now();
            ban::Entity::insert(ban::ActiveModel {
                identity: Set(identity.to_string()),
                banned_by: Set(Some(banned_by.to_string())),
                created_at: Set(now),
                updated_at: Set(now),
            })
            .on_conflict(
                sea_query::OnConflict::column(ban::Column::Identity)
                    .update_columns([
                        ban::Column::BannedBy,
                        ban::Column::UpdatedAt,
                    ])
                    .to_owned(),
            )
            .exec_without_returning(db)
            .await?;
        } else {
            ban::Entity::delete_by_id(identity).exec(db).await?;
        }
        Ok(())
    }

    /// Erases up to `limit` matching events with ids above `after`, and
    /// everything derived from them. Content another event still references
    /// is kept, otherwise an identity could erase a victim's content by
    /// referencing its digests. Blobs are left for the caller; see
    /// `service::erase_identity`, which loops over batches.
    ///
    /// Works through temp tables so nothing scales with the event count on
    /// the client, hence the transaction. Returns `None` once no events match.
    pub async fn erase_events_batch(
        db: &DatabaseTransaction,
        identity: &str,
        limit: u64,
    ) -> Result<ErasedBatch, DbErr> {
        // Collect the events and content we're going to delete this batch.
        let res = db
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "CREATE TEMP TABLE erase_events ON COMMIT DROP AS
                 SELECT id
                 FROM events
                 WHERE events.identity = $1
                 LIMIT $2",
                [identity.into(), limit.into()],
            ))
            .await?;
        if res.rows_affected() == 0 {
            return Ok(ErasedBatch {
                erased: Erased {
                    events: 0,
                    content: 0,
                    blobs: 0,
                },
                blobs: Vec::new(),
            });
        }

        db.execute_unprepared(
            "CREATE TEMP TABLE erase_content ON COMMIT DROP AS
             SELECT DISTINCT content.id
             FROM erase_events
             INNER JOIN events ON events.id = erase_events.id
             INNER JOIN content ON events.content_digest_type = content.digest_type
               AND events.content_digest_bytes = content.digest_bytes"
        )
        .await?;
        db.execute_unprepared("ANALYZE erase_events; ANALYZE erase_content")
            .await?;

        // Delete from tables based on event id.
        for (table, column) in CACHE_EVENT_ID_COLUMNS {
            db.execute_unprepared(&format!(
                "DELETE FROM {table} WHERE {column} IN (SELECT id FROM erase_events)"
            ))
            .await?;
        }

        // NOTE: this can conflict the gravity cron job, which rewrites every
        // tally in one long update. Previously this skipped locked rows, but
        // need to update the tallies based on deleted reactions below, which
        // would be lost if we skipped deletion here.
        db.execute_unprepared(
            "DELETE FROM reaction_tally
             USING erase_events
             WHERE reaction_tally.event_id = erase_events.id",
        )
        .await?;

        // Delete reactions and update the tallies.
        db.execute_unprepared(
            "WITH
             deleted_reaction AS (
               DELETE FROM reaction
               USING erase_events
               WHERE reaction.event_id = erase_events.id
                 OR reaction.on_post = erase_events.id
               RETURNING on_post, positive
             ),
             grouped_deleted_reaction AS (
               SELECT
                 deleted_reaction.on_post,
                 SUM(CASE WHEN deleted_reaction.positive THEN 1 ELSE 0 END) AS positive_count_diff,
                 SUM(CASE WHEN deleted_reaction.positive THEN 0 ELSE 1 END) AS negative_count_diff
               FROM deleted_reaction
               GROUP BY deleted_reaction.on_post
             )
             UPDATE reaction_tally SET
               positive_count = positive_count - grouped_deleted_reaction.positive_count_diff,
               negative_count = negative_count - grouped_deleted_reaction.negative_count_diff,
               decayed_count = reaction_count_decay(positive_count + grouped_deleted_reaction.positive_count_diff, events.created_at)
             FROM grouped_deleted_reaction
             INNER JOIN events ON grouped_deleted_reaction.on_post = events.id
             WHERE reaction_tally.event_id = grouped_deleted_reaction.on_post",
        )
        .await?;

        // Actually delete the events.
        let events = db
            .execute_unprepared("DELETE FROM events USING erase_events WHERE events.id = erase_events.id")
            .await?
            .rows_affected();

        // Delete the content rows which are unique to the events we've deleted
        // above.
        db.execute_unprepared(
            "DELETE FROM erase_content
             USING content, events
             WHERE content.id = erase_content.id
               AND events.content_digest_type = content.digest_type
               AND events.content_digest_bytes = content.digest_bytes",
        )
        .await?;
        let (content, blobs) = delete_content_rows(db).await?;

        Ok(ErasedBatch {
            erased: Erased {
                events,
                content,
                blobs: blobs.len() as u64,
            },
            blobs,
        })
    }

    /// Deletes what is keyed by the identity rather than by event: the
    /// notifications and per-event counts. Run once after the batches.
    /// Counts on other events that include their interactions are left as-is.
    pub async fn erase_derived(
        db: &DatabaseTransaction,
        identity: &str,
    ) -> Result<(), DbErr> {
        for (table, column) in CACHE_EVENT_IDENTITY_COLUMNS {
            db.execute_unprepared(&format!(
                "DELETE FROM {table} WHERE {column} = '{identity}'"
            ))
            .await?;
        }
        Ok(())
    }

    /// Deletes content no event references. Returns the count and the blobs
    /// left for the caller to remove.
    pub async fn prune_orphan_content(
        db: &DatabaseTransaction,
    ) -> Result<(u64, Vec<ContentDigest>), DbErr> {
        db.execute_unprepared(&format!(
            "CREATE TEMP TABLE erase_content ON COMMIT DROP AS \
             SELECT c.id FROM content c WHERE {ORPHAN_CONTENT}"
        ))
        .await?;
        delete_content_rows(db).await
    }
}

const ORPHAN_CONTENT: &str = "NOT EXISTS (\
    SELECT 1 FROM events e \
    WHERE e.content_digest_type = c.digest_type \
      AND e.content_digest_bytes = c.digest_bytes)";

/// Cache tables and the columns in them that hold event ids.
const CACHE_EVENT_ID_COLUMNS: &[(&str, &str)] = &[
    ("follow", "event_id"),
    ("block", "event_id"),
    ("repost", "event_id"),
    ("repost", "post"),
    ("quote", "event_id"),
    ("quote", "post"),
    ("reply", "event_id"),
    ("reply", "post"),
    ("profile", "event_id"),
];

/// Cache tables and the columns in them that hold identities.
const CACHE_EVENT_IDENTITY_COLUMNS: &[(&str, &str)] = &[
    ("notification", "from_identity"),
    ("notification", "to_identity"),
    ("moderator", "identity"),
    ("pairing_session", "issuer_identity"),
    ("pairing_session_claimer", "issuer_identity"),
];

const CONTENT_CHILD_TABLES: [&str; 17] = [
    "content_attributed_to_reaction",
    "content_blob",
    "content_block",
    "content_delete",
    "content_follow",
    "content_identity",
    "content_image",
    "content_label",
    "content_post_attributed_url",
    "content_post",
    "content_profile_update",
    "content_reaction",
    "content_report",
    "content_repost",
    "content_verification_claim",
    "content_verification_target",
    "content_verification_verify",
];

#[derive(Default)]
pub struct Erased {
    pub events: u64,
    pub content: u64,
    pub blobs: u64,
}

pub struct ErasedBatch {
    pub erased: Erased,
    /// Blobs no content references any more, for the caller to remove.
    pub blobs: Vec<ContentDigest>,
}

/// Deletes the content rows listed in the `erase_content` temp table and
/// their child rows. Returns the count and the blobs no content references
/// any more.
async fn delete_content_rows(
    db: &DatabaseTransaction,
) -> Result<(u64, Vec<ContentDigest>), DbErr> {
    db.execute_unprepared(
        "CREATE TEMP TABLE erase_blobs ON COMMIT DROP AS \
         SELECT DISTINCT b.digest_type, b.digest_bytes FROM content_blob b \
         JOIN erase_content x ON x.id = b.content_id",
    )
    .await?;

    for table in CONTENT_CHILD_TABLES {
        db.execute_unprepared(&format!(
            "DELETE FROM {table} WHERE content_id IN (SELECT id FROM erase_content)"
        ))
        .await?;
    }
    let content = db
        .execute_unprepared(
            "DELETE FROM content c USING erase_content x WHERE c.id = x.id",
        )
        .await?
        .rows_affected();

    let blobs = db
        .query_all_raw(Statement::from_string(
            DbBackend::Postgres,
            "SELECT b.digest_type, b.digest_bytes FROM erase_blobs b \
             WHERE NOT EXISTS (\
               SELECT 1 FROM content_blob cb \
               WHERE cb.digest_type = b.digest_type \
                 AND cb.digest_bytes = b.digest_bytes)",
        ))
        .await?
        .iter()
        .map(|row| {
            Ok(ContentDigest {
                r#type: i32::from(row.try_get::<i16>("", "digest_type")?),
                value: row.try_get("", "digest_bytes")?,
            })
        })
        .collect::<Result<Vec<_>, DbErr>>()?;
    Ok((content, blobs))
}
