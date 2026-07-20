//! gRPC `ContentService` impl. Each method delegates to a dedicated
//! handler under `content/rpc/`.

use crate::service::content::content_filestore::ContentFilestore;
use crate::service::content::rpc::{sync_content, upload_blob, url_info};
use crate::service::proto::content_service_server::{
    ContentService, ContentServiceServer,
};
use crate::service::proto::{
    SyncContentRequest, SyncContentResponse, UploadBlobRequest,
    UploadBlobResponse, UrlInfoRequest, UrlInfoResponse,
};
use sea_orm::DatabaseConnection;
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
        request: Request<SyncContentRequest>,
    ) -> Result<Response<SyncContentResponse>, Status> {
        Ok(Response::new(
            sync_content::handle(
                &self.db,
                &self.filestore,
                request.into_inner(),
            )
            .await?,
        ))
    }

    async fn upload_blob(
        &self,
        request: Request<UploadBlobRequest>,
    ) -> Result<Response<UploadBlobResponse>, Status> {
        Ok(Response::new(
            upload_blob::handle(
                &self.db,
                &self.filestore,
                request.into_inner(),
            )
            .await?,
        ))
    }

    async fn url_info(
        &self,
        request: Request<UrlInfoRequest>,
    ) -> Result<Response<UrlInfoResponse>, Status> {
        Ok(Response::new(
            url_info::handle(&self.db, request.into_inner()).await?,
        ))
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
