//! Provides a wall-clock time API that works across our supported platforms.

/// Milliseconds since the Unix epoch.
#[cfg(not(target_arch = "wasm32"))]
pub fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Milliseconds since the Unix epoch.
#[cfg(target_arch = "wasm32")]
pub fn now_millis() -> u64 {
    js_sys::Date::now() as u64
}

/// Seconds since the Unix epoch.
pub fn now_secs() -> u64 {
    now_millis() / 1000
}
