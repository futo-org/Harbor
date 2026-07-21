use crate::service::feeds::repository::{EventWithContentRow, content_join};
use crate::service::proto::content::ContentBody;
use crate::service::proto::{Content, Identity, PublicKey};
use ::entity::{
    ban_model as BanModel, content_model as ContentModel,
    event_model as EventModel, moderator_model as ModeratorModel,
    notification as NotificationModel, reply_count_model as ReplyCountModel,
};
use polycentric_common::models::collections;
use prost::Message;
use sea_orm::*;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

const IDENTITY_COLLECTION: i16 = collections::IDENTITY as i16;

#[derive(Debug, Clone)]
pub struct AuthorizedKey {
    pub key: PublicKey,
    pub is_rotation_key: bool,
}

pub struct Query;

impl Query {
    /// Authorized keys for `identity`'s validated chain head. Walks the IDENTITY-collection events
    /// from genesis
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

    /// Walk the identity chain from genesis and return the head's content,
    /// or `None` when no valid genesis exists.
    pub async fn latest_valid_identity_content(
        db: &DbConn,
        identity: &str,
    ) -> Result<Option<Identity>, DbErr> {
        let rows = Self::list_identity_events_for_identities(
            db,
            vec![identity.to_string()],
        )
        .await?;

        let mut decoded: Vec<DecodedIdentityRow> = rows
            .into_iter()
            .filter_map(|(event, content)| {
                let content_row = content?;
                let signer = PublicKey {
                    key_type: event.public_key_type as i32,
                    key: event.public_key,
                };
                let content_msg =
                    Content::decode(content_row.serialized_bytes.as_slice())
                        .ok()?;
                let identity_content = match content_msg.content_body? {
                    ContentBody::Identity(i) => i,
                    _ => return None,
                };
                Some(DecodedIdentityRow {
                    sequence: event.sequence as u64,
                    signer,
                    content: identity_content,
                })
            })
            .collect();
        decoded.sort_by_key(|r| r.sequence);

        // Genesis: the earliest event whose Identity content's sha256 matches
        // the identity string.
        let genesis = match decoded
            .iter()
            .find(|r| identity_matches_content(identity, &r.content))
        {
            Some(g) => g,
            None => return Ok(None),
        };

        let mut head = genesis.content.clone();
        let mut head_seq = genesis.sequence;
        loop {
            let next_seq = head_seq + 1;
            let next = decoded
                .iter()
                .filter(|r| {
                    r.sequence == next_seq
                        && authorizes_rotation(&head, &r.signer)
                })
                .min_by(|a, b| a.signer.key.cmp(&b.signer.key));
            match next {
                Some(e) => {
                    head = e.content.clone();
                    head_seq = next_seq;
                }
                None => break,
            }
        }
        Ok(Some(head))
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
    pub async fn is_banned(db: &DbConn, identity: &str) -> Result<bool, DbErr> {
        Ok(BanModel::Entity::find_by_id(identity)
            .one(db)
            .await?
            .is_some())
    }

    /// Every banned identity, most recently banned first.
    pub async fn list_bans(db: &DbConn) -> Result<Vec<String>, DbErr> {
        Ok(BanModel::Entity::find()
            .order_by_desc(BanModel::Column::CreatedAt)
            .all(db)
            .await?
            .into_iter()
            .map(|row| row.identity)
            .collect())
    }

    /// Every IDENTITY-collection event (full chain) for each of
    /// `identities`. Sent as hints on feed/thread/list responses so
    /// clients can validate post authors without re-fetching the chain.
    pub async fn list_identity_events_for_identities(
        db: &DbConn,
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
    /// row. Idempotent in both directions.
    pub async fn set_banned<C: ConnectionTrait>(
        db: &C,
        identity: &str,
        banned: bool,
    ) -> Result<(), DbErr> {
        if banned {
            let now = chrono::Utc::now();
            BanModel::Entity::insert(BanModel::ActiveModel {
                identity: Set(identity.to_string()),
                created_at: Set(now),
                updated_at: Set(now),
            })
            .on_conflict(
                sea_query::OnConflict::column(BanModel::Column::Identity)
                    .do_nothing()
                    .to_owned(),
            )
            .do_nothing()
            .exec(db)
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

struct DecodedIdentityRow {
    sequence: u64,
    signer: PublicKey,
    content: Identity,
}

/// True when `identity` is the hex sha256 of the encoded `Identity`
/// content (the canonical genesis-identifier convention).
fn identity_matches_content(identity: &str, content: &Identity) -> bool {
    let mut h = Sha256::new();
    h.update(content.encode_to_vec());
    let hex: String =
        h.finalize().iter().map(|b| format!("{:02x}", b)).collect();
    hex == identity
}

fn authorizes_rotation(content: &Identity, signer: &PublicKey) -> bool {
    content
        .rotation_keys
        .iter()
        .any(|k| k.key_type == signer.key_type && k.key == signer.key)
}
