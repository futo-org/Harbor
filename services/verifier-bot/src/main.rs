//! Harbor's verifier bot: checks that a Harbor identity controls an account
//! on another platform and, if so, publishes a signed verification of the
//! claim as the bot's own identity.

mod app;
mod bot;
mod browser;
mod claims;
mod config;
mod error;
mod health;
mod legacy_postgres;
#[cfg(test)]
mod live_tests;
mod metrics;
mod platforms;
mod util;
mod verifier;

use std::net::SocketAddr;
use std::sync::Arc;

use crate::app::{App, Sessions};
use crate::browser::SharedBrowser;
use crate::config::Config;

#[tokio::main]
async fn main() {
    // Load .env before anything reads the environment.
    common_dotenv::load(".env");
    common_telemetry::init();

    if let Err(e) = run().await {
        tracing::error!("{e}");
        eprintln!("verifier-bot: {e}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let config = Config::from_env()?;
    metrics::init();

    let client = bot::load_client(&config).await?;
    bot::ensure_profile(&client, &config).await;

    let browser = SharedBrowser::new(config.chrome_executable_path.clone());
    let platforms = platforms::all(&config, &browser);
    for platform in &platforms {
        for verifier in &platform.verifiers {
            verifier.init().await;
            tracing::info!(
                "Initialized verifier with type '{}' for platform '{}' (route '{}').",
                verifier.verifier_type().as_str(),
                verifier.platform,
                verifier.slug()
            );
        }
    }
    let verifiers: Vec<_> = platforms
        .iter()
        .flat_map(|p| p.verifiers.iter().cloned())
        .collect();

    let app = Arc::new(App {
        backend: Arc::new(client.clone()),
        identity: client.active_identity(),
        platforms,
        allowed_callbacks: config.allowed_callbacks.clone(),
        sessions: Sessions::default(),
    });
    let router = app::router(app, &config.allowed_origins);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("failed to bind {addr}: {e}"))?;
    tracing::info!("Verifiers server listening on port {}", config.port);

    // Periodic per-platform health checks feed the dashboard's up/down gauges.
    if let Some(interval) = config.health_check_interval {
        tracing::info!("Health checks every {}s", interval.as_secs_f64());
        tokio::spawn(health::health_check_loop(verifiers, interval));
    }

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| format!("server failed: {e}"))
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
