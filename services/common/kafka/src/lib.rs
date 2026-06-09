//! Shared Kafka helpers. Producers and consumers read the same broker /
//! security / SASL settings from the environment.

mod config;
mod consumer;
mod producer;

pub use rdkafka::Offset;
pub use rdkafka::message::{BorrowedMessage, Headers, Message};

pub use consumer::{CommitMode, Consumer, CustomContext, build_consumer};
pub use producer::{FutureProducer, FutureRecord, build_producer};
