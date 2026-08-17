use crate::service::feeds::repository::{EventWithContentRow, content_join};
use crate::service::identity::chain;
use crate::service::proto::{Identity, PublicKey};
use ::entity::{
    ban_model as BanModel, content_model as ContentModel,
    event_model as EventModel, moderator_model as ModeratorModel,
    notification as NotificationModel, reply_count_model as ReplyCountModel,
};
use polycentric_common::models::collections;
use sea_orm::*;
use std::collections::HashSet;

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
        Ok(ModeratorModel::Entity::find_by_id(identity)
            .one(db)
            .await?
            .is_some())
    }

    /// True when `identity` has a row in the `ban` table.
    pub async fn is_banned<C: ConnectionTrait>(
        db: &C,
        identity: &str,
    ) -> Result<bool, DbErr> {
        Ok(BanModel::Entity::find_by_id(identity)
            .one(db)
            .await?
            .is_some())
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
    ) -> Result<Vec<BanModel::Model>, DbErr> {
        let mut q = BanModel::Entity::find()
            .order_by_desc(BanModel::Column::CreatedAt)
            .order_by_desc(BanModel::Column::Identity)
            .limit(limit);

        if let Some(cursor) = after {
            // Keyset: rows strictly "older" than the cursor in the
            // (created_at, identity) descending order.
            q = q.filter(
                Condition::any()
                    .add(BanModel::Column::CreatedAt.lt(cursor.created_at))
                    .add(
                        Condition::all()
                            .add(
                                BanModel::Column::CreatedAt
                                    .eq(cursor.created_at),
                            )
                            .add(
                                BanModel::Column::Identity
                                    .lt(cursor.identity.clone()),
                            ),
                    ),
            );
        }

        if let Some(query) = query {
            q = q.filter(BanModel::Column::Identity.starts_with(query));
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
        EventModel::Entity::find()
            .select_also(ContentModel::Entity)
            .join(JoinType::LeftJoin, content_join())
            .filter(EventModel::Column::Collection.eq(IDENTITY_COLLECTION))
            .filter(EventModel::Column::Identity.is_in(identities))
            .order_by_asc(EventModel::Column::Sequence)
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
            BanModel::Entity::insert(BanModel::ActiveModel {
                identity: Set(identity.to_string()),
                banned_by: Set(Some(banned_by.to_string())),
                created_at: Set(now),
                updated_at: Set(now),
            })
            .on_conflict(
                sea_query::OnConflict::column(BanModel::Column::Identity)
                    .update_columns([
                        BanModel::Column::BannedBy,
                        BanModel::Column::UpdatedAt,
                    ])
                    .to_owned(),
            )
            .exec_without_returning(db)
            .await?;
        } else {
            BanModel::Entity::delete_by_id(identity).exec(db).await?;
        }
        Ok(())
    }

    /// Erases everything `identity` published to this server: its
    /// events, any content rows no other identity's events still
    /// reference (plus their per-kind child rows), its notifications,
    /// and its reply-count rows. Content is deduplicated by digest and
    /// content bytes are public, so rows another identity's events
    /// still reference are kept — otherwise getting banned on purpose
    /// after referencing a victim's digests would erase the victim's
    /// content. Blob bodies in the filestore are not touched; they
    /// become unreachable once their `content_blob` rows are gone.
    pub async fn erase_identity_content<C: ConnectionTrait>(
        db: &C,
        identity: &str,
    ) -> Result<(), DbErr> {
        // Content rows referenced by the identity's events, collected
        // before the events are deleted.
        let candidate_ids =
            content_ids_for_identity_events(db, identity).await?;

        EventModel::Entity::delete_many()
            .filter(EventModel::Column::Identity.eq(identity))
            .exec(db)
            .await?;

        let kept_ids = still_referenced_content_ids(db, &candidate_ids).await?;
        let orphan_ids: Vec<i64> = candidate_ids
            .into_iter()
            .filter(|id| !kept_ids.contains(id))
            .collect();
        delete_content_rows(db, &orphan_ids).await?;

        NotificationModel::Entity::delete_many()
            .filter(
                Condition::any()
                    .add(NotificationModel::Column::FromIdentity.eq(identity))
                    .add(NotificationModel::Column::ToIdentity.eq(identity)),
            )
            .exec(db)
            .await?;

        // Counts of replies *to* the identity's own events. Counts on
        // other identities' events that included replies from this
        // identity are left as-is.
        ReplyCountModel::Entity::delete_many()
            .filter(ReplyCountModel::Column::EventKeyIdentity.eq(identity))
            .exec(db)
            .await?;

        Ok(())
    }
}

/// Ids of content rows referenced by `identity`'s events.
async fn content_ids_for_identity_events<C: ConnectionTrait>(
    db: &C,
    identity: &str,
) -> Result<Vec<i64>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            r#"SELECT DISTINCT c.id FROM content c
               JOIN events e ON e.content_digest_type = c.digest_type
                 AND e.content_digest_bytes = c.digest_bytes
               WHERE e.identity = $1"#,
            [identity.into()],
        ))
        .await?;
    rows.iter().map(|row| row.try_get("", "id")).collect()
}

/// The subset of `content_ids` still referenced by some event.
async fn still_referenced_content_ids<C: ConnectionTrait>(
    db: &C,
    content_ids: &[i64],
) -> Result<HashSet<i64>, DbErr> {
    let mut kept = HashSet::new();
    for chunk in content_ids.chunks(1000) {
        let rows = db
            .query_all_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                r#"SELECT DISTINCT c.id FROM content c
                   JOIN events e ON e.content_digest_type = c.digest_type
                     AND e.content_digest_bytes = c.digest_bytes
                   WHERE c.id = ANY($1)"#,
                [chunk.to_vec().into()],
            ))
            .await?;
        for row in rows {
            kept.insert(row.try_get::<i64>("", "id")?);
        }
    }
    Ok(kept)
}

/// Deletes content rows and their per-kind child rows.
async fn delete_content_rows<C: ConnectionTrait>(
    db: &C,
    content_ids: &[i64],
) -> Result<(), DbErr> {
    use ::entity::{
        content_blob_model, content_block_model, content_delete_model,
        content_follow_model, content_identity_model, content_image_model,
        content_label_model, content_post_model, content_profile_update_model,
        content_reaction_model, content_report_model, content_repost_model,
        content_verification_claim_model, content_verification_target_model,
        content_verification_verify_model,
    };

    for chunk in content_ids.chunks(1000) {
        macro_rules! delete_children {
            ($($model:ident),* $(,)?) => {
                $(
                    $model::Entity::delete_many()
                        .filter(
                            $model::Column::ContentId
                                .is_in(chunk.iter().copied()),
                        )
                        .exec(db)
                        .await?;
                )*
            };
        }
        delete_children!(
            content_blob_model,
            content_block_model,
            content_delete_model,
            content_follow_model,
            content_identity_model,
            content_image_model,
            content_label_model,
            content_post_model,
            content_profile_update_model,
            content_reaction_model,
            content_report_model,
            content_repost_model,
            content_verification_claim_model,
            content_verification_target_model,
            content_verification_verify_model,
        );
        ContentModel::Entity::delete_many()
            .filter(ContentModel::Column::Id.is_in(chunk.iter().copied()))
            .exec(db)
            .await?;
    }
    Ok(())
}
