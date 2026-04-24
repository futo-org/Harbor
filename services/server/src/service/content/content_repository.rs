use crate::service::proto::Blob;
use ::entity::{
    content_blob_model as ContentBlobModel, content_model as ContentModel,
};
use prost::Message;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::{ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter};
use sha2::{Digest, Sha256};

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
}

pub struct Mutation;

impl Mutation {
    pub async fn add_content<C: ConnectionTrait>(
        db: &C,
        active_model: ContentModel::ActiveModel,
    ) -> Result<ContentModel::Model, DbErr> {
        active_model.insert(db).await
    }

    pub async fn save_blob<C: ConnectionTrait>(
        db: &C,
        blob: &Blob,
        synced_at: time::PrimitiveDateTime,
    ) -> Result<(), DbErr> {
        let digest = match &blob.digest {
            Some(d) => d,
            None => return Ok(()),
        };

        let blob_bytes = blob.encode_to_vec();
        let content_digest_bytes = Sha256::digest(&blob_bytes).to_vec();

        let content_result = Self::add_content(
            db,
            ContentModel::ActiveModel {
                id: NotSet,
                digest_type: Set(digest.r#type),
                digest_bytes: Set(content_digest_bytes),
                serialized_bytes: Set(blob_bytes),
                synced_at: Set(synced_at),
            },
        )
        .await;

        match content_result {
            Ok(content_row) => {
                let blob_insert = ContentBlobModel::ActiveModel {
                    content_id: Set(content_row.id),
                    digest_type: Set(digest.r#type as i16),
                    digest_bytes: Set(digest.value.clone()),
                    mime_type: Set(blob.mime_type.clone()),
                    size: Set(blob.size),
                }
                .insert(db)
                .await;

                if let Err(e) = blob_insert
                    && !is_unique_violation(&e)
                {
                    return Err(e);
                }
            }
            Err(ref e) if is_unique_violation(e) => {
                // Already tracked, nothing to do.
            }
            Err(e) => return Err(e),
        }

        Ok(())
    }
}

fn is_unique_violation(err: &DbErr) -> bool {
    let runtime_err = match err {
        DbErr::Query(e) | DbErr::Exec(e) => Some(e),
        _ => None,
    };
    if let Some(sea_orm::RuntimeErr::SqlxError(arc_err)) = runtime_err
        && let Some(db_err) = arc_err.as_database_error()
    {
        return db_err.is_unique_violation();
    }
    false
}
