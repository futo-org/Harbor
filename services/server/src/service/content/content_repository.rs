use crate::service::proto::Blob;
use ::entity::{
    content_blob_model as ContentBlobModel, content_model as ContentModel,
};
use polycentric_common::models::protos_v2::ContentDigest;
use prost::Message;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::sea_query::Expr;
use sea_orm::sea_query::OnConflict;
use sea_orm::*;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use time::OffsetDateTime;

pub struct Query;

impl Query {
    /// Look up a blob row by its body digest. `None` if not tracked.
    pub async fn find_blob_by_digest<C: ConnectionTrait>(
        db: &C,
        digest_type: i16,
        digest_bytes: &[u8],
    ) -> Result<Option<ContentBlobModel::Model>, DbErr> {
        ContentBlobModel::Entity::find()
            .filter(ContentBlobModel::Column::DigestType.eq(digest_type))
            .filter(ContentBlobModel::Column::DigestBytes.eq(digest_bytes))
            .one(db)
            .await
    }

    /// Search the database for blobs matching the provided digests
    /// and return a set of the digests that were found.
    pub async fn find_digests_in_db<C: ConnectionTrait>(
        db: &C,
        digests: &Vec<&ContentDigest>,
    ) -> Result<HashSet<ContentDigest>, DbErr> {
        if digests.is_empty() {
            return Ok(HashSet::new());
        }

        let digest_tuples = digests
            .iter()
            .map(|digest| (digest.r#type, digest.value.clone()))
            .collect::<Vec<_>>();

        let present = ContentBlobModel::Entity::find()
            .filter(
                Expr::tuple([
                    Expr::col(ContentBlobModel::Column::DigestType),
                    Expr::col(ContentBlobModel::Column::DigestBytes),
                ])
                .in_tuples(digest_tuples),
            )
            .all(db)
            .await?
            .into_iter()
            .map(|row| ContentDigest {
                r#type: row.digest_type as i32,
                value: row.digest_bytes,
            })
            .collect::<HashSet<_>>();

        Ok(present)
    }
}

pub struct Mutation;

impl Mutation {
    pub async fn add_content<C: ConnectionTrait>(
        db: &C,
        active_model: ContentModel::ActiveModel,
    ) -> Result<Option<ContentModel::Model>, DbErr> {
        let result = ContentModel::Entity::insert(active_model)
            .on_conflict(
                OnConflict::columns([
                    ContentModel::Column::DigestType,
                    ContentModel::Column::DigestBytes,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec_with_returning(db)
            .await;

        match result {
            Ok(model) => Ok(Some(model)),
            Err(DbErr::RecordNotInserted | DbErr::RecordNotFound(_)) => {
                Ok(None)
            }
            Err(e) => Err(e),
        }
    }

    pub async fn save_blob<C: ConnectionTrait>(
        db: &C,
        blob: &Blob,
        synced_at: OffsetDateTime,
    ) -> Result<(), DbErr> {
        let digest = match &blob.digest {
            Some(d) => d,
            None => return Ok(()),
        };

        let blob_bytes = blob.encode_to_vec();
        let content_digest_bytes = Sha256::digest(&blob_bytes).to_vec();

        let content_row = Self::add_content(
            db,
            ContentModel::ActiveModel {
                id: NotSet,
                digest_type: Set(digest.r#type),
                digest_bytes: Set(content_digest_bytes),
                serialized_bytes: Set(blob_bytes),
                synced_at: Set(synced_at),
            },
        )
        .await?;

        let Some(content_row) = content_row else {
            // Content with this digest already tracked — the blob child row
            // would have been written then; nothing to do.
            return Ok(());
        };

        let blob_insert =
            ContentBlobModel::Entity::insert(ContentBlobModel::ActiveModel {
                content_id: Set(content_row.id),
                digest_type: Set(digest.r#type as i16),
                digest_bytes: Set(digest.value.clone()),
                mime_type: Set(blob.mime_type.clone()),
                size: Set(blob.size),
            })
            .on_conflict(
                OnConflict::columns([
                    ContentBlobModel::Column::DigestType,
                    ContentBlobModel::Column::DigestBytes,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec(db)
            .await;

        match blob_insert {
            Ok(_) | Err(DbErr::RecordNotInserted) => Ok(()),
            Err(e) => Err(e),
        }
    }
}
