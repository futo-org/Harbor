//! In-memory span collection for tests.

use opentelemetry::global;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::{InMemorySpanExporter, SdkTracerProvider};
use tracing::Subscriber;
use tracing_subscriber::layer::SubscriberExt;

/// A subscriber exporting every span to the returned exporter, with the
/// W3C propagator installed.
pub fn subscriber() -> (impl Subscriber + Send + Sync, InMemorySpanExporter) {
    global::set_text_map_propagator(TraceContextPropagator::new());
    let exporter = InMemorySpanExporter::default();
    let provider = SdkTracerProvider::builder()
        .with_simple_exporter(exporter.clone())
        .build();
    let tracer = opentelemetry::trace::TracerProvider::tracer(&provider, "test");
    let subscriber =
        tracing_subscriber::registry().with(tracing_opentelemetry::layer().with_tracer(tracer));
    (subscriber, exporter)
}
