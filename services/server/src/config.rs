//! Server configuration sourced from the environment.

use std::sync::LazyLock;

/// The canonical URL of this server (`POLYCENTRIC_SERVER_NAME`). Also
/// stamped as the source on produced Kafka events.
pub static SERVER_NAME: LazyLock<String> = LazyLock::new(|| {
    std::env::var("POLYCENTRIC_SERVER_NAME")
        .unwrap_or_else(|_| "http://localhost:3000".to_string())
});

/// Accepted auth token audiences (`POLYCENTRIC_ALLOW_HOSTS`, comma
/// delimited). Defaults to [`SERVER_NAME`].
pub static ALLOW_HOSTS: LazyLock<Vec<String>> =
    LazyLock::new(|| match std::env::var("POLYCENTRIC_ALLOW_HOSTS") {
        Ok(hosts) => hosts
            .split(',')
            .map(str::trim)
            .filter(|host| !host.is_empty())
            .map(str::to_string)
            .collect(),
        Err(_) => vec![SERVER_NAME.clone()],
    });
