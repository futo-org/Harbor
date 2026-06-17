//! `upload_blob`: persist a blob's metadata row and write its bytes
//! to the filestore. Mutation — does not use the events pipeline.

use crate::service::{
    content::{
        content_filestore::ContentFilestore,
        content_helpers::parse_upload_blob_request,
        content_repository as ContentRepository,
    },
    proto::{UploadBlobRequest, UploadBlobResponse},
};
use sea_orm::{DatabaseConnection, TransactionTrait};
use time::OffsetDateTime;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    filestore: &ContentFilestore,
    req: UploadBlobRequest,
) -> Result<UploadBlobResponse, Status> {
    let (blob, digest, body) = parse_upload_blob_request(req)?;

    let txn = db.begin().await.map_err(|e| {
        eprintln!("upload_blob txn begin error: {e}");
        Status::internal("internal server error")
    })?;
    ContentRepository::Mutation::save_blob(
        &txn,
        &blob,
        OffsetDateTime::now_utc(),
    )
    .await
    .map_err(|e| {
        eprintln!("upload_blob save_blob error: {e}");
        Status::internal("internal server error")
    })?;
    txn.commit().await.map_err(|e| {
        eprintln!("upload_blob txn commit error: {e}");
        Status::internal("internal server error")
    })?;

    filestore.write_blob(&digest, body).await.map_err(|e| {
        eprintln!("upload_blob filestore error: {e}");
        Status::internal("internal server error")
    })?;

    Ok(UploadBlobResponse {})
}
