use crate::data::EventWithContentRow;
use crate::service::feeds::repository::content_join;
use crate::service::identity::chain;
use crate::service::proto::{ContentDigest, Identity, PublicKey};
use ::entity::{
    ban_model as BanModel, block_model as BlockModel,
    content_model as ContentModel, event_model as EventModel,
    follow_model as FollowModel, moderator_model as ModeratorModel,
    notification as NotificationModel, quote_model as QuoteModel,
    reaction_model as ReactionModel,
    reaction_summary_model as ReactionSummaryModel,
    reaction_tally_model as ReactionTalliesModel,
    reaction_tally_model2 as ReactionTallyModel,
    reply_count_model as ReplyCountModel, reply_model as ReplyModel,
    repost_model as RepostModel,
};
use polycentric_common::models::collections;
use sea_orm::sea_query::IntoCondition;
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
        ModeratorModel::Entity::find_by_id(identity)
            .exists(db)
            .await
    }

    /// Number of events `selector` matches.
    pub async fn count_events<C: ConnectionTrait>(
        db: &C,
        selector: &EventsSelector<'_>,
    ) -> Result<u64, DbErr> {
        EventModel::Entity::find()
            .filter(selector.condition())
            .count(db)
            .await
    }

    /// Ids of content rows no event references.
    pub async fn orphan_content_ids<C: ConnectionTrait>(
        db: &C,
    ) -> Result<Vec<i64>, DbErr> {
        let rows = db
            .query_all_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                r#"SELECT c.id FROM content c
                   WHERE NOT EXISTS (
                     SELECT 1 FROM events e
                     WHERE e.content_digest_type = c.digest_type
                       AND e.content_digest_bytes = c.digest_bytes
                   )"#,
                [],
            ))
            .await?;
        rows.iter().map(|row| row.try_get("", "id")).collect()
    }

    /// True when `identity` has a row in the `ban` table.
    pub async fn is_banned<C: ConnectionTrait>(
        db: &C,
        identity: &str,
    ) -> Result<bool, DbErr> {
        BanModel::Entity::find_by_id(identity).exists(db).await
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

    /// Erases matching events and everything derived from them. Content
    /// another event still references is kept, otherwise an identity could
    /// erase a victim's content by referencing its digests. Blobs are left
    /// for the caller; see `service::erase_events`.
    pub async fn erase_events<C: ConnectionTrait>(
        db: &C,
        selector: &EventsSelector<'_>,
    ) -> Result<Erased, DbErr> {
        let event_ids: Vec<i64> = EventModel::Entity::find()
            .select_only()
            .column(EventModel::Column::Id)
            .filter(selector.condition())
            .into_tuple()
            .all(db)
            .await?;
        let identities: Vec<String> = EventModel::Entity::find()
            .select_only()
            .column(EventModel::Column::Identity)
            .distinct()
            .filter(selector.condition())
            .into_tuple()
            .all(db)
            .await?;
        let candidate_ids = content_ids_for_events(db, &event_ids).await?;

        delete_cache_rows(db, &event_ids).await?;

        let events = EventModel::Entity::delete_many()
            .filter(selector.condition())
            .exec(db)
            .await?
            .rows_affected;

        let kept_ids = still_referenced_content_ids(db, &candidate_ids).await?;
        let orphan_ids: Vec<i64> = candidate_ids
            .into_iter()
            .filter(|id| !kept_ids.contains(id))
            .collect();
        let blobs = delete_content_rows(db, &orphan_ids).await?;

        // Counts on other events that include their interactions are left as-is.
        match selector {
            EventsSelector::Identity(identity) => {
                NotificationModel::Entity::delete_many()
                    .filter(
                        Condition::any()
                            .add(
                                NotificationModel::Column::FromIdentity
                                    .eq(*identity),
                            )
                            .add(
                                NotificationModel::Column::ToIdentity
                                    .eq(*identity),
                            ),
                    )
                    .exec(db)
                    .await?;
                ReplyCountModel::Entity::delete_many()
                    .filter(
                        ReplyCountModel::Column::EventKeyIdentity.eq(*identity),
                    )
                    .exec(db)
                    .await?;
                ReactionSummaryModel::Entity::delete_many()
                    .filter(
                        ReactionSummaryModel::Column::EventKeyIdentity
                            .eq(*identity),
                    )
                    .exec(db)
                    .await?;
                ReactionTalliesModel::Entity::delete_many()
                    .filter(
                        ReactionTalliesModel::Column::EventKeyIdentity
                            .eq(*identity),
                    )
                    .exec(db)
                    .await?;
            }
            EventsSelector::PublicKey(key) => {
                let key = key.to_vec();
                NotificationModel::Entity::delete_many()
                    .filter(
                        NotificationModel::Column::TriggerEventKeyPublicKey
                            .eq(key.clone()),
                    )
                    .exec(db)
                    .await?;
                ReplyCountModel::Entity::delete_many()
                    .filter(
                        ReplyCountModel::Column::EventKeyPublicKey
                            .eq(key.clone()),
                    )
                    .exec(db)
                    .await?;
                ReactionSummaryModel::Entity::delete_many()
                    .filter(
                        ReactionSummaryModel::Column::EventKeyPublicKey
                            .eq(key.clone()),
                    )
                    .exec(db)
                    .await?;
                ReactionTalliesModel::Entity::delete_many()
                    .filter(
                        ReactionTalliesModel::Column::EventKeyPublicKey.eq(key),
                    )
                    .exec(db)
                    .await?;
            }
        }

        Ok(Erased {
            events,
            content: orphan_ids.len(),
            blobs,
            identities,
        })
    }

    /// Deletes content no event references. Blobs are left for the caller.
    pub async fn prune_orphan_content<C: ConnectionTrait>(
        db: &C,
    ) -> Result<Erased, DbErr> {
        let ids = Query::orphan_content_ids(db).await?;
        let blobs = delete_content_rows(db, &ids).await?;
        Ok(Erased {
            events: 0,
            content: ids.len(),
            blobs,
            identities: Vec::new(),
        })
    }
}

pub enum EventsSelector<'a> {
    /// Every event of an identity, whichever key signed it.
    Identity(&'a str),
    /// Every event signed by a key, whichever identity it acted for.
    PublicKey(&'a [u8]),
}

impl EventsSelector<'_> {
    fn condition(&self) -> Condition {
        match self {
            Self::Identity(identity) => {
                EventModel::Column::Identity.eq(*identity).into_condition()
            }
            Self::PublicKey(key) => EventModel::Column::PublicKey
                .eq(key.to_vec())
                .into_condition(),
        }
    }
}

pub struct Erased {
    pub events: u64,
    pub content: usize,
    /// Blobs no content references any more.
    pub blobs: Vec<ContentDigest>,
    /// Identities whose events were removed.
    pub identities: Vec<String>,
}

/// Ids of content rows referenced by `event_ids`.
async fn content_ids_for_events<C: ConnectionTrait>(
    db: &C,
    event_ids: &[i64],
) -> Result<Vec<i64>, DbErr> {
    let mut ids = HashSet::new();
    for chunk in event_ids.chunks(1000) {
        let rows = db
            .query_all_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                r#"SELECT DISTINCT c.id FROM content c
                   JOIN events e ON e.content_digest_type = c.digest_type
                     AND e.content_digest_bytes = c.digest_bytes
                   WHERE e.id = ANY($1)"#,
                [chunk.to_vec().into()],
            ))
            .await?;
        for row in rows {
            ids.insert(row.try_get::<i64>("", "id")?);
        }
    }
    Ok(ids.into_iter().collect())
}

/// Deletes cache rows keyed by or pointing at `event_ids`.
async fn delete_cache_rows<C: ConnectionTrait>(
    db: &C,
    event_ids: &[i64],
) -> Result<(), DbErr> {
    for chunk in event_ids.chunks(1000) {
        macro_rules! delete_where {
            ($model:ident, $($column:ident),+) => {
                $model::Entity::delete_many()
                    .filter(
                        Condition::any()
                            $(.add($model::Column::$column.is_in(chunk.iter().copied())))+
                    )
                    .exec(db)
                    .await?;
            };
        }
        delete_where!(FollowModel, EventId);
        delete_where!(BlockModel, EventId);
        delete_where!(ReactionTallyModel, EventId);
        delete_where!(ReactionModel, EventId, OnPost);
        delete_where!(RepostModel, EventId, Post);
        delete_where!(QuoteModel, EventId, Post);
        delete_where!(ReplyModel, EventId, Post);
    }
    Ok(())
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

/// Deletes content rows and their child rows. Returns blobs no content
/// references any more.
async fn delete_content_rows<C: ConnectionTrait>(
    db: &C,
    content_ids: &[i64],
) -> Result<Vec<ContentDigest>, DbErr> {
    use ::entity::{
        content_attributed_to_reaction_model, content_blob_model,
        content_block_model, content_delete_model, content_follow_model,
        content_identity_model, content_image_model, content_label_model,
        content_post_attributed_url_model, content_post_model,
        content_profile_update_model, content_reaction_model,
        content_report_model, content_repost_model,
        content_verification_claim_model, content_verification_target_model,
        content_verification_verify_model,
    };

    let mut blobs: Vec<(i16, Vec<u8>)> = Vec::new();
    for chunk in content_ids.chunks(1000) {
        blobs.extend(
            content_blob_model::Entity::find()
                .select_only()
                .column(content_blob_model::Column::DigestType)
                .column(content_blob_model::Column::DigestBytes)
                .filter(
                    content_blob_model::Column::ContentId
                        .is_in(chunk.iter().copied()),
                )
                .into_tuple::<(i16, Vec<u8>)>()
                .all(db)
                .await?,
        );
    }
    blobs.sort();
    blobs.dedup();

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
            content_attributed_to_reaction_model,
            content_blob_model,
            content_block_model,
            content_delete_model,
            content_follow_model,
            content_identity_model,
            content_image_model,
            content_label_model,
            content_post_attributed_url_model,
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

    let mut orphans = Vec::new();
    for chunk in blobs.chunks(1000) {
        let kept: HashSet<(i16, Vec<u8>)> = content_blob_model::Entity::find()
            .select_only()
            .column(content_blob_model::Column::DigestType)
            .column(content_blob_model::Column::DigestBytes)
            .filter(
                content_blob_model::Column::DigestBytes
                    .is_in(chunk.iter().map(|(_, bytes)| bytes.clone())),
            )
            .into_tuple()
            .all(db)
            .await?
            .into_iter()
            .collect();
        orphans.extend(chunk.iter().filter(|blob| !kept.contains(blob)).map(
            |(digest_type, bytes)| ContentDigest {
                r#type: i32::from(*digest_type),
                value: bytes.clone(),
            },
        ));
    }
    Ok(orphans)
}
