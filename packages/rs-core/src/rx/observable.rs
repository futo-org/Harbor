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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn delivers_next_then_complete() {
        let observable: Observable<i32> = Observable::new(|subscriber| {
            subscriber.next(1);
            subscriber.next(2);
            subscriber.complete();
        });

        let received = Arc::new(Mutex::new(Vec::<i32>::new()));
        let completed = Arc::new(Mutex::new(false));
        let errored = Arc::new(Mutex::new(None::<String>));

        let received_n = received.clone();
        let completed_c = completed.clone();
        let errored_e = errored.clone();
        observable.subscribe(
            move |v| received_n.lock().unwrap().push(v),
            move |e| *errored_e.lock().unwrap() = Some(e),
            move || *completed_c.lock().unwrap() = true,
        );

        assert_eq!(*received.lock().unwrap(), vec![1, 2]);
        assert!(*completed.lock().unwrap());
        assert!(errored.lock().unwrap().is_none());
    }

    #[test]
    fn error_is_propagated() {
        let observable: Observable<i32> =
            Observable::new(|subscriber| subscriber.error("boom".into()));

        let captured = Arc::new(Mutex::new(None::<String>));
        let captured_e = captured.clone();
        observable.subscribe(
            move |_| {},
            move |e| *captured_e.lock().unwrap() = Some(e),
            move || {},
        );

        assert_eq!(captured.lock().unwrap().as_deref(), Some("boom"));
    }

    #[test]
    fn subscriber_suppresses_emissions_after_unsubscribe() {
        // Capture the subscriber so the test can drive emissions after
        // unsubscribe runs.
        let captured: Arc<Mutex<Option<Subscriber<i32>>>> = Arc::new(Mutex::new(None));
        let captured_in_factory = captured.clone();
        let observable: Observable<i32> = Observable::new(move |subscriber| {
            *captured_in_factory.lock().unwrap() = Some(subscriber);
        });

        let received = Arc::new(Mutex::new(Vec::<i32>::new()));
        let completed = Arc::new(Mutex::new(false));
        let received_n = received.clone();
        let completed_c = completed.clone();
        let subscription = observable.subscribe(
            move |v| received_n.lock().unwrap().push(v),
            move |_| {},
            move || *completed_c.lock().unwrap() = true,
        );

        let guard = captured.lock().unwrap();
        let subscriber = guard.as_ref().expect("subscriber not captured");

        subscriber.next(1);
        subscription.unsubscribe();
        // Post-unsubscribe emissions are swallowed.
        subscriber.next(2);
        subscriber.complete();

        assert_eq!(*received.lock().unwrap(), vec![1]);
        assert!(!*completed.lock().unwrap());
        assert!(subscriber.is_closed());
    }
}
