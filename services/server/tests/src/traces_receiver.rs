//! OTLP/HTTP receiver for the integration suite. It keeps every span the
//! server exports while the suite runs and hands them all back on `GET
//! /v1/traces`, so the traces test can look for its own (traces.rs). It
//! listens on `HARBOR_TEST_TRACES_PORT` (default 4318).

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use opentelemetry_proto::tonic::collector::trace::v1::{
    ExportTraceServiceRequest, ExportTraceServiceResponse,
};
use opentelemetry_proto::tonic::trace::v1::ResourceSpans;
use prost::Message;

type Received = Arc<Mutex<Vec<ResourceSpans>>>;

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("HARBOR_TEST_TRACES_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4318);
    let app = Router::new()
        .route("/v1/traces", post(receive).get(dump))
        .with_state(Received::default());
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("failed to bind the traces receiver");
    axum::serve(listener, app).await.unwrap();
}

async fn receive(
    State(received): State<Received>,
    body: Bytes,
) -> impl IntoResponse {
    let Ok(request) = ExportTraceServiceRequest::decode(body) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    received.lock().unwrap().extend(request.resource_spans);
    (
        [("content-type", "application/x-protobuf")],
        ExportTraceServiceResponse::default().encode_to_vec(),
    )
        .into_response()
}

async fn dump(State(received): State<Received>) -> Vec<u8> {
    ExportTraceServiceRequest {
        resource_spans: received.lock().unwrap().clone(),
    }
    .encode_to_vec()
}
