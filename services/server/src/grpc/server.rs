use crate::lib;
use tonic::transport::Server;

/// Builds reflection for gRPC docs. The file descriptors are created in ./build.rs.
fn build_reflection_service() -> Result<
    tonic_reflection::server::v1::ServerReflectionServer<
        impl tonic_reflection::server::v1::ServerReflection,
    >,
    Box<dyn std::error::Error>,
> {
    let service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(lib::proto::FILE_DESCRIPTOR_SET)
        .build_v1()?;
    Ok(service)
}

/// Serve the gRPC
pub async fn serve_grpc() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:50051".parse()?;
    let events_service = lib::events::events_service::build_events_service();
    let reflection_service = build_reflection_service()?;

    println!("GRPC server is listening on {addr}");

    Server::builder()
        .add_service(reflection_service)
        .add_service(events_service)
        .serve(addr)
        .await?;

    Ok(())
}
