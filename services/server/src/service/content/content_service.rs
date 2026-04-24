use crate::service::content::content_filestore::ContentFilestore;
use crate::service::content::content_repository as ContentRepository;
use crate::service::proto::content_service_server::{
    ContentService, ContentServiceServer,
};
use crate::service::proto::{
    SyncContentRequest, SyncContentResponse, UploadBlobRequest,
    UploadBlobResponse,
};
use crate::util;
use sea_orm::{DatabaseConnection, TransactionTrait};
use tonic::{Request, Response, Status};

#[derive(Debug)]
pub struct ContentServiceImpl {
    db: DatabaseConnection,
    filestore: ContentFilestore,
}

#[tonic::async_trait]
impl ContentService for ContentServiceImpl {
    async fn sync_content(
        &self,
        _request: Request<SyncContentRequest>,
    ) -> Result<Response<SyncContentResponse>, Status> {
        Err(Status::unimplemented("sync_content is not implemented"))
    }

    async fn upload_blob(
        &self,
        request: Request<UploadBlobRequest>,
    ) -> Result<Response<UploadBlobResponse>, Status> {
        let inner = request.into_inner();

        let blob = inner.blob.ok_or_else(|| {
            Status::invalid_argument("upload_blob: blob is required")
        })?;
        let digest = blob.digest.clone().ok_or_else(|| {
            Status::invalid_argument("upload_blob: blob.digest is required")
        })?;

        if blob.size as usize != inner.body.len() {
            return Err(Status::invalid_argument(format!(
                "upload_blob: declared size {} does not match body length {}",
                blob.size,
                inner.body.len()
            )));
        }

        util::digest::verify_content_digest(
            digest.r#type,
            &digest.value,
            &inner.body,
        )
        .map_err(|e| Status::invalid_argument(e.to_string()))?;

        let now = time::OffsetDateTime::now_utc();
        let synced_at = time::PrimitiveDateTime::new(now.date(), now.time());

        let txn = self.db.begin().await.map_err(|e| {
            eprintln!("upload_blob txn begin error: {e}");
            Status::internal("internal server error")
        })?;
        ContentRepository::Mutation::save_blob(&txn, &blob, synced_at)
            .await
            .map_err(|e| {
                eprintln!("upload_blob save_blob error: {e}");
                Status::internal("internal server error")
            })?;
        txn.commit().await.map_err(|e| {
            eprintln!("upload_blob txn commit error: {e}");
            Status::internal("internal server error")
        })?;

        self.filestore
            .write_blob(&digest, &inner.body)
            .await
            .map_err(|e| {
                eprintln!("upload_blob filestore error: {e}");
                Status::internal("internal server error")
            })?;

        Ok(Response::new(UploadBlobResponse {}))
    }
}

pub fn build_content_service(
    db: DatabaseConnection,
    filestore: ContentFilestore,
) -> ContentServiceServer<ContentServiceImpl> {
    ContentServiceServer::new(ContentServiceImpl { db, filestore })
}
