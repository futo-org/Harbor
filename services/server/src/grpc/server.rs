use crate::service;
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::server::server_service::ServerConfig;
use axum::Router;
use http::header::HeaderName;
use sea_orm::DatabaseConnection;
use tonic::service::Routes;
use tonic_web::GrpcWebLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_layer::Layer;

/// Builds reflection for gRPC docs. The file descriptors are created in ./build.rs.
fn build_reflection_service() -> Result<
    tonic_reflection::server::v1::ServerReflectionServer<
        impl tonic_reflection::server::v1::ServerReflection,
    >,
    Box<dyn std::error::Error>,
> {
    let service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(
            service::proto::FILE_DESCRIPTOR_SET,
        )
        .build_v1()?;
    Ok(service)
}

/// Build the gRPC services as an `axum::Router` so they can be merged with
/// the HTTP router and served on a single port.
pub fn build_grpc_router(
    db: DatabaseConnection,
    filestore: ContentFilestore,
    server_config: ServerConfig,
) -> Result<Router, Box<dyn std::error::Error>> {
    let events_service =
        service::events::events_service::build_events_service(db.clone());
    let feeds_service =
        service::feeds::feeds_service::build_feeds_service(db.clone());
    let content_service =
        service::content::content_service::build_content_service(db, filestore);
    let server_info_service =
        service::server::server_service::build_server_service(server_config);
    let reflection_service = build_reflection_service()?;

    let grpc_web = GrpcWebLayer::new();

    let routes = Routes::default()
        .add_service(grpc_web.layer(reflection_service))
        .add_service(grpc_web.layer(events_service))
        .add_service(grpc_web.layer(feeds_service))
        .add_service(grpc_web.layer(content_service))
        .add_service(grpc_web.layer(server_info_service));

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::any())
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("x-grpc-web"),
            HeaderName::from_static("grpc-timeout"),
        ])
        .expose_headers([
            HeaderName::from_static("grpc-status"),
            HeaderName::from_static("grpc-message"),
        ])
        .allow_methods([http::Method::POST, http::Method::OPTIONS])
        .max_age(std::time::Duration::from_secs(86400));

    Ok(routes.into_axum_router().layer(cors))
}
