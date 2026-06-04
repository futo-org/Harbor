use common_object_store::ObjectStore;
use sea_orm::DatabaseConnection;

use crate::polycentric::PolycentricClient;
use crate::providers::azure::AzureClient;

/// Shared service dependencies threaded through message processing.
pub struct Context {
    pub db: DatabaseConnection,
    /// Azure moderation client.
    pub azure: AzureClient,
    /// Blob store for fetching image content.
    pub blobs: ObjectStore,
    /// Polycentric client (to talk to other polycentric servers)
    pub polycentric: PolycentricClient,
}
