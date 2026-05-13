//! Foreign-implemented log sink. Hosts (JS, Kotlin, Swift) register
//! an implementation via `set_logger`; rs-core code that calls
//! `log_msg` forwards messages to it. Cross-target by construction —
//! native targets and wasm both reach the host through the same FFI
//! callback uniffi already builds for us.

use std::sync::{Arc, Mutex};

#[uniffi::export(with_foreign)]
pub trait Logger: Send + Sync {
    fn log(&self, message: String);
}

static LOGGER: Mutex<Option<Arc<dyn Logger>>> = Mutex::new(None);

/// Register the foreign logger. Replaces any previously-set value.
#[uniffi::export]
pub fn set_logger(logger: Arc<dyn Logger>) {
    *LOGGER.lock().unwrap() = Some(logger);
}

/// Forward `message` to the registered foreign logger (if any). The
/// Arc is cloned out of the mutex before the foreign call so a
/// re-entrant logger impl can't deadlock against `set_logger`.
pub(crate) fn log_msg(message: impl Into<String>) {
    let logger = LOGGER.lock().unwrap().clone();
    if let Some(l) = logger {
        l.log(message.into());
    }
}
