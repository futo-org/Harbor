//! Trace export over OTLP/HTTP and W3C trace context propagation.

use std::env;
use std::sync::OnceLock;

use opentelemetry::propagation::{Extractor, Injector};
use opentelemetry::trace::{TraceContextExt, TracerProvider};
use opentelemetry::{Context, global};
use opentelemetry_http::{HeaderExtractor, HeaderInjector};
use opentelemetry_otlp::{ExporterBuildError, WithExportConfig};
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::{SdkTracerProvider, Tracer};
use tracing::Subscriber;
use tracing_opentelemetry::{OpenTelemetryLayer, OpenTelemetrySpanExt};
use tracing_subscriber::registry::LookupSpan;

static PROVIDER: OnceLock<SdkTracerProvider> = OnceLock::new();

pub type Layer<S> = OpenTelemetryLayer<S, Tracer>;

pub struct Config {
    /// Base URL of the OTLP/HTTP collector; spans go to `/v1/traces` under it.
    pub url: String,
    pub service_name: String,
}

impl Config {
    /// `HARBOR_TRACES_URL` and `HARBOR_SERVICE_NAME` (default: the binary's
    /// name). `None` when no URL is set.
    pub fn from_env() -> Option<Self> {
        let url = env::var("HARBOR_TRACES_URL")
            .ok()
            .filter(|v| !v.is_empty())?;
        let service_name = env::var("HARBOR_SERVICE_NAME")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| Some(env::current_exe().ok()?.file_stem()?.to_str()?.to_owned()))
            .unwrap_or_else(|| "unknown_service".to_owned());
        Some(Self { url, service_name })
    }
}

/// A `tracing` layer exporting spans in batches, with the W3C propagator
/// installed. The exporter runs until [`shutdown`].
pub fn layer<S>(config: Config) -> Result<Layer<S>, ExporterBuildError>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    global::set_text_map_propagator(TraceContextPropagator::new());
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_endpoint(format!("{}/v1/traces", config.url.trim_end_matches('/')))
        .build()?;
    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(
            Resource::builder()
                .with_service_name(config.service_name)
                .build(),
        )
        .build();
    let tracer = provider.tracer("tracing");
    let _ = PROVIDER.set(provider);
    Ok(tracing_opentelemetry::layer().with_tracer(tracer))
}

/// Flush and stop the exporter. Call before the process exits.
pub fn shutdown() {
    if let Some(provider) = PROVIDER.get()
        && let Err(e) = provider.shutdown()
    {
        tracing::warn!(error = %e, "failed to shut down tracer provider");
    }
}

/// Make `span` a child of `parent`, as extracted from an incoming carrier.
pub fn set_parent(span: &tracing::Span, parent: Context) {
    let _ = span.set_parent(parent);
}

/// The trace id of `span`, when it is being exported.
pub fn trace_id(span: &tracing::Span) -> Option<String> {
    trace_id_of(&span.context())
}

/// The trace id carried by `context`, when it has one.
pub fn trace_id_of(context: &Context) -> Option<String> {
    let span = context.span();
    let span_context = span.span_context();
    span_context
        .is_valid()
        .then(|| span_context.trace_id().to_string())
}

/// The trace context carried by `extractor`.
pub fn extract(extractor: &dyn Extractor) -> Context {
    global::get_text_map_propagator(|p| p.extract(extractor))
}

/// Add the current span's trace context to `injector`.
pub fn inject(injector: &mut dyn Injector) {
    let context = tracing::Span::current().context();
    global::get_text_map_propagator(|p| p.inject_context(&context, injector))
}

/// The trace context in a request's headers.
pub fn context_from_headers(headers: &http::HeaderMap) -> Context {
    extract(&HeaderExtractor(headers))
}

/// Add the current span's trace context to outgoing request headers.
pub fn inject_headers(headers: &mut http::HeaderMap) {
    inject(&mut HeaderInjector(headers))
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
    use opentelemetry_proto::tonic::common::v1::any_value::Value;
    use prost::Message;
    use tracing_subscriber::EnvFilter;

    #[test]
    fn exports_info_spans_whatever_the_log_filter_says() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let listener =
            runtime.block_on(async { tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap() });
        let port = listener.local_addr().unwrap().port();
        runtime.spawn(async move {
            let app = axum::Router::new().route(
                "/v1/traces",
                axum::routing::post(move |body: axum::body::Bytes| {
                    let sender = sender.clone();
                    async move {
                        sender
                            .send(ExportTraceServiceRequest::decode(body).unwrap())
                            .unwrap();
                        ""
                    }
                }),
            );
            axum::serve(listener, app).await.unwrap();
        });

        let layer = layer(Config {
            url: format!("http://127.0.0.1:{port}/"),
            service_name: "telemetry-test".to_owned(),
        })
        .unwrap();
        let subscriber = crate::subscriber(EnvFilter::new("warn"), false, Some(layer));
        tracing::subscriber::with_default(subscriber, || {
            tracing::info_span!("probe").in_scope(|| {});
        });
        shutdown();

        let request = receiver
            .recv_timeout(std::time::Duration::from_secs(10))
            .expect("no spans exported");
        let resource = &request.resource_spans[0];
        let service_name = resource
            .resource
            .as_ref()
            .unwrap()
            .attributes
            .iter()
            .find(|a| a.key == "service.name")
            .and_then(|a| a.value.clone()?.value);
        assert_eq!(
            service_name,
            Some(Value::StringValue("telemetry-test".to_owned()))
        );
        let names: Vec<&str> = resource.scope_spans[0]
            .spans
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        assert_eq!(names, ["probe"]);
    }
}
