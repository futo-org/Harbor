pub mod reflection_ui;
pub mod server;

use tonic::Response;
use tonic::metadata::MetadataValue;

/// A server-streaming response. `no-transform` stops proxies compressing it,
/// as a compressor buffers the stream's messages.
pub fn stream_response<S>(stream: S) -> Response<S> {
    let mut response = Response::new(stream);
    response
        .metadata_mut()
        .insert("cache-control", MetadataValue::from_static("no-transform"));
    response
}

