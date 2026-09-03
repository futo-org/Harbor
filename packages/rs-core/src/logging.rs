//! Foreign-implemented log sink. Hosts (JS, Kotlin, Swift) register
//! an implementation via `set_logger`; rs-core code logs through the
//! leveled helpers below. Cross-target by construction — native targets
//! and wasm both reach the host through the same FFI callback uniffi
//! already builds for us.
//!
//! Every message crosses the FFI boundary as a synchronous host call, so a
//! burst of messages can stall the host's thread (on React Native, each call
//! marshals across the bridge into a `console.log`). Two guards keep that in
//! check:
//!   * **Level filtering** — messages below the host-configured threshold
//!     ([`set_log_level`], default [`LogLevel::Info`]) are dropped in Rust and
//!     never cross FFI. The message string isn't even formatted (the helpers
//!     take a closure), so filtered logging is nearly free.
//!   * Hosts are still expected to make their sink non-blocking (batch/drop)
//!     for defense in depth.

use std::any::Any;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

use crate::lock::LockRecover;

/// Severity of a log message. Hosts set a minimum threshold via
/// [`set_log_level`]; anything below it is dropped before crossing FFI.
#[derive(Clone, Copy, PartialEq, Eq, Debug, uniffi::Enum)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    /// Disables all logging.
    Off,
}

impl LogLevel {
    fn rank(self) -> u8 {
        match self {
            LogLevel::Trace => 0,
            LogLevel::Debug => 1,
            LogLevel::Info => 2,
            LogLevel::Warn => 3,
            LogLevel::Error => 4,
            LogLevel::Off => 5,
        }
    }
}

#[uniffi::export(with_foreign)]
pub trait Logger: Send + Sync {
    fn log(&self, message: String);
}

static LOGGER: Mutex<Option<Arc<dyn Logger>>> = Mutex::new(None);
/// Minimum level that crosses FFI. Defaults to `Info` so debug/trace
/// floods are dropped unless a host explicitly opts in.
static MIN_LEVEL: AtomicU8 = AtomicU8::new(2);

/// Register the foreign logger. Replaces any previously-set value.
#[uniffi::export]
pub fn set_logger(logger: Arc<dyn Logger>) {
    *LOGGER.lock_recover() = Some(logger);
}

/// Set the minimum level forwarded to the host. Messages below this are
/// dropped in Rust without crossing the FFI boundary.
#[uniffi::export]
pub fn set_log_level(level: LogLevel) {
    MIN_LEVEL.store(level.rank(), Ordering::Relaxed);
}

/// Log at `level`. The message is only built (and only crosses FFI) when
/// `level` is at or above the configured threshold — pass a closure so the
/// `format!` cost is skipped for filtered messages.
pub(crate) fn log_at(level: LogLevel, message: impl FnOnce() -> String) {
    if level.rank() < MIN_LEVEL.load(Ordering::Relaxed) {
        return;
    }
    // Clone the Arc out of the mutex before the foreign call so a
    // re-entrant logger impl can't deadlock against `set_logger`.
    let logger = LOGGER.lock_recover().clone();
    if let Some(l) = logger {
        l.log(message());
    }
}

pub(crate) fn log_debug(message: impl FnOnce() -> String) {
    log_at(LogLevel::Debug, message);
}

#[allow(dead_code)]
pub(crate) fn log_info(message: impl FnOnce() -> String) {
    log_at(LogLevel::Info, message);
}

#[allow(dead_code)]
pub(crate) fn log_warn(message: impl FnOnce() -> String) {
    log_at(LogLevel::Warn, message);
}

#[allow(dead_code)]
pub(crate) fn log_error(message: impl FnOnce() -> String) {
    log_at(LogLevel::Error, message);
}

/// Best-effort message extraction from a panic payload.
pub(crate) fn panic_payload_message(payload: &(dyn Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_string()
    }
}
