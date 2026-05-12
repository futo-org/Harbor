use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(uniffi::Object)]
pub struct Subscription {
    closed: AtomicBool,
}

#[uniffi::export]
impl Subscription {
    pub fn unsubscribe(&self) {
        self.closed.store(true, Ordering::SeqCst);
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }
}

impl Subscription {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            closed: AtomicBool::new(false),
        })
    }
}