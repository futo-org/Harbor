use proto::events_server::{Events, EventsServer};
use proto::{ListEventsReply, ListEventsRequest};
use tonic::{Request, Response, Status, transport::Server};

pub mod proto {
    tonic::include_proto!("polycentric");
    pub const FILE_DESCRIPTOR_SET: &[u8] =
        include_bytes!(concat!(env!("OUT_DIR"), "/services.bin"));
}

#[derive(Debug, Default)]
pub struct EventsInner {}

#[tonic::async_trait]
impl Events for EventsInner {
    async fn list_events(
        &self,
        request: Request<ListEventsRequest>,
    ) -> Result<Response<ListEventsReply>, Status> {
        let reply = ListEventsReply {
            message: format!(
                "You asked for {} events",
                request.into_inner().limit
            ),
        };

        Ok(Response::new(reply))
    }
}

/// Builds reflection for gRPC docs. The file descriptors are created in ./build.rs.
fn build_reflection_service() -> Result<
    tonic_reflection::server::v1::ServerReflectionServer<
        impl tonic_reflection::server::v1::ServerReflection,
    >,
    Box<dyn std::error::Error>,
> {
    let service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(proto::FILE_DESCRIPTOR_SET)
        .build_v1()?;
    Ok(service)
}

/// Serve the gRPC
pub async fn serve_grpc() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:50051".parse()?;
    let events = EventsInner::default();
    let reflection_service = build_reflection_service()?;

    println!("GRPC server is listening on {addr}");

    Server::builder()
        .add_service(reflection_service)
        .add_service(EventsServer::new(events))
        .serve(addr)
        .await?;

    Ok(())
}
