use std::sync::Arc;

use otlp_service::{config, identity, routes};
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    common_dotenv::load(".env");
    let config = config::init()?;

    common_telemetry::init();
    common_telemetry::init_metrics("otlp");

    let state = routes::AppState {
        config,
        http: reqwest::Client::new(),
        identities: Arc::new(
            identity::PolycentricIdentities::connect(config.query_servers.clone()).await?,
        ),
    };

    let listener = tokio::net::TcpListener::bind(config.addr).await?;
    info!(addr = %config.addr, "otlp listening");
    axum::serve(listener, routes::build_routes(state)).await?;
    Ok(())
}
