use crate::rx::subscription::Subscription;
use std::sync::Arc;

#[uniffi::export(with_foreign)]
pub trait Observer: Send + Sync {
    fn next(&self, value: String);
    fn error(&self, message: String);
    fn complete(&self);
}


pub struct Subscriber<T> {
    next: Box<dyn Fn(T) + Send + Sync>,
    error: Box<dyn Fn(String) + Send + Sync>,
    complete: Box<dyn Fn() + Send + Sync>,
    subscription: Arc<Subscription>,
}

impl<T> Subscriber<T> {
    pub fn next(&self, value: T) {
        if self.subscription.is_closed() {
            return;
        }
        (self.next)(value);
    }

    pub fn error(&self, message: String) {
        if self.subscription.is_closed() {
            return;
        }
        (self.error)(message);
    }

    pub fn complete(&self) {
        if self.subscription.is_closed() {
            return;
        }
        (self.complete)();
    }

    pub fn is_closed(&self) -> bool {
        self.subscription.is_closed()
    }
}


pub struct Observable<T> {
    subscribe: Box<dyn Fn(Subscriber<T>) + Send + Sync>,
}

impl<T: 'static> Observable<T> {

    pub fn new(subscribe: impl Fn(Subscriber<T>) + Send + Sync + 'static) -> Self {
        Self {
            subscribe: Box::new(subscribe),
        }
    }

    pub fn subscribe(
        &self,
        next: impl Fn(T) + Send + Sync + 'static,
        error: impl Fn(String) + Send + Sync + 'static,
        complete: impl Fn() + Send + Sync + 'static,
    ) -> Arc<Subscription> {
        let subscription = Subscription::new();
        let subscriber = Subscriber {
            next: Box::new(next),
            error: Box::new(error),
            complete: Box::new(complete),
            subscription: subscription.clone(),
        };
        (self.subscribe)(subscriber);
        subscription
    }
}
