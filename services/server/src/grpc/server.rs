use crate::db::client::build_db_client;
use crate::service;
use http::header::HeaderName;
use tonic::transport::Server;
use tower_http::cors::{AllowOrigin, CorsLayer};

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

/// Attempt to connect to the database, retrying with backoff.
async fn connect_db_with_retry() -> sea_orm::DatabaseConnection {
    let mut delay = std::time::Duration::from_secs(1);
    loop {
        match build_db_client().await {
            Ok(db) => return db,
            Err(e) => {
                eprintln!(
                    "Failed to connect to database: {e}, retrying in {delay:?}"
                );
                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(std::time::Duration::from_secs(30));
            }
        }
    }
}

/// Serve the gRPC
pub async fn serve_grpc() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:50051".parse()?;
    let db = connect_db_with_retry().await;
    let events_service =
        service::events::events_service::build_events_service(db.clone());
    let feeds_service = service::feeds::feeds_service::build_feeds_service(db);
    let reflection_service = build_reflection_service()?;

    println!("GRPC server is listening on {addr}");

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
        .allow_methods([http::Method::POST, http::Method::OPTIONS]);

    Server::builder()
        .accept_http1(true)
        .layer(cors)
        .layer(tonic_web::GrpcWebLayer::new())
        .add_service(reflection_service)
        .add_service(events_service)
        .add_service(feeds_service)
        .serve(addr)
        .await?;

    Ok(())
}
