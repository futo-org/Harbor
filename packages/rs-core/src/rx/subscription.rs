use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// Cancellation handle for an observable subscription. Unsubscribing only
/// sets a flag; in-flight work notices it and stops emitting.
#[derive(uniffi::Object)]
pub struct Subscription {
    closed: AtomicBool,
}

#[uniffi::export]
impl Subscription {
    /// Stop receiving emissions. Idempotent.
    pub fn unsubscribe(&self) {
        self.closed.store(true, Ordering::SeqCst);
    }

    /// Whether [`Self::unsubscribe`] has been called.
    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }
}

impl Subscription {
    /// A new, open subscription.
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            closed: AtomicBool::new(false),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_subscription_is_open() {
        let sub = Subscription::new();
        assert!(!sub.is_closed());
    }

    #[test]
    fn unsubscribe_marks_closed() {
        let sub = Subscription::new();
        sub.unsubscribe();
        assert!(sub.is_closed());
    }

    #[test]
    fn unsubscribe_is_idempotent() {
        let sub = Subscription::new();
        sub.unsubscribe();
        sub.unsubscribe();
        assert!(sub.is_closed());
    }
}
