//! `sync_content`: not yet implemented. Stubbed to return
//! `Unimplemented`.

use crate::service::content::content_filestore::ContentFilestore;
use crate::service::proto::{SyncContentRequest, SyncContentResponse};
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    _db: &DatabaseConnection,
    _filestore: &ContentFilestore,
    _req: SyncContentRequest,
) -> Result<SyncContentResponse, Status> {
    Err(Status::unimplemented("sync_content is not implemented"))
}
