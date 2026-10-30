//! Shared Kafka helpers. Producers and consumers read the same broker /
//! security / SASL settings from the environment.

mod config;
mod consumer;
mod producer;
mod trace;

pub use rdkafka::Offset;
pub use rdkafka::message::{BorrowedMessage, Headers, Message};

pub use config::prefixed;
pub use consumer::{Consumer, CustomContext, build_consumer};
pub use producer::{FutureProducer, FutureRecord, build_producer};
pub use trace::{trace_context, with_trace_context};
