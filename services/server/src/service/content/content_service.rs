use crate::service::content::content_filestore::ContentFilestore;
use crate::service::content::content_helpers::parse_upload_blob_request;
use crate::service::content::content_repository as ContentRepository;
use crate::service::proto::content_service_server::{
    ContentService, ContentServiceServer,
};
use crate::service::proto::{
    SyncContentRequest, SyncContentResponse, UploadBlobRequest,
    UploadBlobResponse,
};
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
        let (blob, digest, body) =
            parse_upload_blob_request(request.into_inner())?;

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
            .write_blob(&digest, body)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::content::content_filestore::ContentFilestoreConfig;
    use sea_orm::{DbBackend, MockDatabase};
    use tonic::Code;

    async fn impl_for_testing() -> ContentServiceImpl {
        let filestore = ContentFilestore::new(ContentFilestoreConfig {
            bucket: "test".into(),
            region: "us-east-1".into(),
            endpoint: None,
            force_path_style: false,
            access_key: Some("test".into()),
            secret_key: Some("test".into()),
        })
        .await;
        ContentServiceImpl {
            db: MockDatabase::new(DbBackend::Postgres).into_connection(),
            filestore,
        }
    }

    #[tokio::test]
    async fn sync_content_returns_unimplemented() {
        let service = impl_for_testing().await;
        let err = service
            .sync_content(Request::new(SyncContentRequest::default()))
            .await
            .unwrap_err();
        assert_eq!(err.code(), Code::Unimplemented);
    }

    #[tokio::test]
    async fn upload_blob_rejects_missing_blob() {
        let service = impl_for_testing().await;
        let err = service
            .upload_blob(Request::new(UploadBlobRequest {
                blob: None,
                body: vec![],
            }))
            .await
            .unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
    }
}
