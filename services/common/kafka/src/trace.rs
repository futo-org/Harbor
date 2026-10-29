//! W3C trace context carried in message headers, so a worker's span joins
//! the trace of the request that produced the message.

use opentelemetry::Context;
use opentelemetry::propagation::{Extractor, Injector};
use rdkafka::message::{BorrowedMessage, Header, Headers, Message, OwnedHeaders};

/// Add the current span's trace context to `headers`.
pub fn with_trace_context(headers: OwnedHeaders) -> OwnedHeaders {
    let mut injector = HeadersInjector(Some(headers));
    common_telemetry::trace::inject(&mut injector);
    injector.0.unwrap()
}

/// The trace context in a message's headers.
pub fn trace_context(message: &BorrowedMessage<'_>) -> Context {
    common_telemetry::trace::extract(&MessageExtractor(message))
}

struct HeadersInjector(Option<OwnedHeaders>);

impl Injector for HeadersInjector {
    fn set(&mut self, key: &str, value: String) {
        let headers = self.0.take().unwrap();
        self.0 = Some(headers.insert(Header {
            key,
            value: Some(&value),
        }));
    }
}

struct MessageExtractor<'a>(&'a BorrowedMessage<'a>);

impl Extractor for MessageExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        let headers = self.0.headers()?;
        let header = headers.iter().find(|h| h.key == key)?;
        std::str::from_utf8(header.value?).ok()
    }

    fn keys(&self) -> Vec<&str> {
        self.0
            .headers()
            .map(|h| h.iter().map(|h| h.key).collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_carry_the_current_spans_trace() {
        let (subscriber, _exporter) = common_telemetry::testing::subscriber();
        let _guard = tracing::subscriber::set_default(subscriber);
        let span = tracing::info_span!("publish");
        let _entered = span.enter();

        let headers = with_trace_context(OwnedHeaders::new());
        let traceparent = headers
            .iter()
            .find(|h| h.key == "traceparent")
            .and_then(|h| h.value)
            .map(|v| std::str::from_utf8(v).unwrap())
            .expect("traceparent header");

        let trace_id = common_telemetry::trace::trace_id(&span).unwrap();
        assert_eq!(&traceparent[3..35], trace_id);
    }
}
