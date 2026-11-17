//! `upload_blob`: persist a blob's metadata row and write its bytes
//! to the filestore. Mutation — does not use the events pipeline.

use tonic::Status;

use crate::service::content::content_filestore::{ContentFilestore, blob_key};
use crate::service::content::content_helpers::parse_upload_blob_request;
use crate::service::content::content_repository::Mutation;
use crate::service::context::PublicContext;
use crate::service::proto::{UploadBlobRequest, UploadBlobResponse};

pub async fn handle(
    mut ctx: PublicContext,
    filestore: &ContentFilestore,
    req: UploadBlobRequest,
) -> Result<UploadBlobResponse, Status> {
    let (blob, digest, body) = parse_upload_blob_request(req)?;

    let mut tx = ctx.db.begin().await.map_err(|err| {
        tracing::error!(error = %err, "failed to begin transaction");
        Status::internal("internal server error")
    })?;

    let stored = match Mutation::save_blob(&mut tx, &blob).await {
        Ok(stored) => stored,
        Err(err) => {
            tracing::error!(error = %err, "failed to store blob");
            if let Err(err) = tx.rollback().await {
                tracing::warn!(error = %err, "failed to rollback transaction");
            }
            return Err(Status::internal("internal server error"));
        }
    };

    if !stored {
        // Blob already stored, not uploading it again.
        return Ok(UploadBlobResponse {});
    }

    let key = blob_key(&digest);
    let size = body.len() as i64;

    if let Err(err) = filestore.write_blob(&digest, body).await {
        tracing::error!(error = %err, "failed to upload blob to file store");
        if let Err(err) = tx.rollback().await {
            tracing::warn!(error = %err, "failed to rollback transaction");
        }
        return Err(Status::internal("internal server error"));
    }

    if let Err(err) = Mutation::add_blob_index(&mut tx, key, digest, size).await
    {
        tracing::error!(error = %err, "failed blob to index");
        if let Err(err) = tx.rollback().await {
            tracing::warn!(error = %err, "failed to rollback transaction");
        }
        return Err(Status::internal("internal server error"));
    }

    tx.commit().await.map_err(|err| {
        tracing::error!(error = %err, "failed to commit transaction");
        Status::internal("internal server error")
    })?;

    Ok(UploadBlobResponse {})
}
