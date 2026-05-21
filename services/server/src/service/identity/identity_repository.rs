use crate::service::feeds::feeds_repository::{FeedRow, content_join};
use crate::service::proto::content::ContentBody;
use crate::service::proto::{Content, Identity, PublicKey};
use ::entity::{content_model as ContentModel, event_model as EventModel};
use polycentric_common::models::collections;
use prost::Message;
use sea_orm::*;
use sha2::{Digest, Sha256};

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
    async fn latest_valid_identity_content(
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

    /// Every IDENTITY-collection event (full chain) for each of
    /// `identities`. Sent as hints on feed/thread/list responses so
    /// clients can validate post authors without re-fetching the chain.
    pub async fn list_identity_events_for_identities(
        db: &DbConn,
        identities: Vec<String>,
    ) -> Result<Vec<FeedRow>, DbErr> {
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
