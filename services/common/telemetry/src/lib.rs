//! Shared structured-logging setup for the Rust services.

use std::io::IsTerminal;

use tracing_subscriber::EnvFilter;

/// Initialize logging: `RUST_LOG` filters (default `info`), JSON to stdout
/// in deployments, human-readable text on a terminal. `LOG_FORMAT=json|text`
/// overrides the format. `log` macros are bridged into `tracing`.
pub fn init() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let json = match std::env::var("LOG_FORMAT").as_deref() {
        Ok("json") => true,
        Ok("text") => false,
        _ => !std::io::stdout().is_terminal(),
    };

    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    if json {
        builder.json().flatten_event(true).init();
    } else {
        builder.init();
    }
}
