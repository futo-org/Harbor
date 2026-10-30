//! Shared structured-logging, tracing and metrics setup for the Rust
//! services.

#[cfg(feature = "testing")]
pub mod testing;
pub mod trace;

use std::env;
use std::io::IsTerminal;

use opentelemetry::KeyValue;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use prometheus::Encoder;
use tracing::Subscriber;
use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer, Registry};

/// Initialize logging and tracing: `RUST_LOG` filters the logs (default
/// `info`), JSON to stdout in deployments, human-readable text on a
/// terminal. `HARBOR_LOG_FORMAT=json|text` overrides the format. `log`
/// macros are bridged into `tracing`. Spans at `info` and above are
/// exported when `HARBOR_TRACES_URL` is set, whatever `RUST_LOG` says, see
/// [`trace`].
pub fn init() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let json = match env::var("HARBOR_LOG_FORMAT")
        .or_else(|_| env::var("LOG_FORMAT"))
        .as_deref()
    {
        Ok("json") => true,
        Ok("text") => false,
        _ => !std::io::stdout().is_terminal(),
    };

    let traces = trace::Config::from_env().and_then(|config| {
        trace::layer(config)
            .inspect_err(|e| eprintln!("failed to build OTLP span exporter: {e}"))
            .ok()
    });
    subscriber(filter, json, traces).init();
}

/// Logs filtered by `filter`; spans at `info` and above go to `traces`.
fn subscriber(
    filter: EnvFilter,
    json: bool,
    traces: Option<trace::Layer<Registry>>,
) -> Box<dyn Subscriber + Send + Sync> {
    let registry = tracing_subscriber::registry()
        .with(traces.map(|layer| layer.with_filter(LevelFilter::INFO)));
    let fmt = tracing_subscriber::fmt::layer();
    if json {
        Box::new(registry.with(fmt.json().flatten_event(true).with_filter(filter)))
    } else {
        Box::new(registry.with(fmt.with_filter(filter)))
    }
}

/// Install a Prometheus-backed OpenTelemetry meter provider and serve
/// GET /metrics on 0.0.0.0:$HARBOR_METRICS_PORT (default 9464). Must be called
/// from within a tokio runtime.
pub fn init_metrics(service_name: &str) {
    let registry = prometheus::Registry::new();
    let exporter = opentelemetry_prometheus::exporter()
        .with_registry(registry.clone())
        .build()
        .expect("failed to build Prometheus exporter");
    let provider = SdkMeterProvider::builder()
        .with_reader(exporter)
        .with_resource(
            Resource::builder()
                .with_service_name(service_name.to_string())
                .build(),
        )
        .build();
    opentelemetry::global::set_meter_provider(provider);

    let port: u16 = env::var("HARBOR_METRICS_PORT")
        .or_else(|_| env::var("METRICS_PORT"))
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9464);
    tokio::spawn(serve_metrics(registry, port));
}

/// Export the database pool's open connections (`db_pool_connections`,
/// by `state` = `idle` | `used`) and its configured ceiling
/// (`db_pool_max_connections`) as gauges sampled on every scrape. The
/// callbacks hold a pool handle for the life of the process.
pub fn observe_db_pool<DB: sqlx::Database>(meter_name: &'static str, pool: sqlx::Pool<DB>) {
    let meter = opentelemetry::global::meter(meter_name);
    let max = u64::from(pool.options().get_max_connections());
    meter
        .u64_observable_gauge("db_pool_max_connections")
        .with_callback(move |gauge| gauge.observe(max, &[]))
        .build();
    meter
        .u64_observable_gauge("db_pool_connections")
        .with_callback(move |gauge| {
            let size = u64::from(pool.size());
            let idle = pool.num_idle() as u64;
            gauge.observe(idle, &[KeyValue::new("state", "idle")]);
            gauge.observe(size.saturating_sub(idle), &[KeyValue::new("state", "used")]);
        })
        .build();
}

async fn serve_metrics(registry: prometheus::Registry, port: u16) {
    let app = axum::Router::new().route(
        "/metrics",
        axum::routing::get(move || {
            let registry = registry.clone();
            async move {
                let mut buf = Vec::new();
                if prometheus::TextEncoder::new()
                    .encode(&registry.gather(), &mut buf)
                    .is_err()
                {
                    buf.clear();
                }
                (
                    [(
                        axum::http::header::CONTENT_TYPE,
                        "text/plain; version=0.0.4",
                    )],
                    buf,
                )
            }
        }),
    );
    match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => {
            if let Err(e) = axum::serve(listener, app).await {
                tracing::error!(error = %e, "metrics server failed");
            }
        }
        Err(e) => tracing::error!(error = %e, port, "failed to bind metrics port"),
    }
}
