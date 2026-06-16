use common_object_store::ObjectStore;
use sea_orm::DatabaseConnection;

use crate::{
    polycentric::PolycentricClient,
    providers::{azure::AzureClient, photodna::PhotoDnaClient},
};

/// Shared service dependencies threaded through message processing.
pub struct Context {
    pub db: DatabaseConnection,
    /// Azure moderation client.
    pub azure: AzureClient,
    /// PhotoDNA CSAM client. If `None`, content is moderated only by Azure.
    pub photodna: Option<PhotoDnaClient>,
    /// Blob store for fetching image content.
    pub blobs: ObjectStore,
    /// Polycentric client (to talk to other polycentric servers)
    pub polycentric: PolycentricClient,
}
