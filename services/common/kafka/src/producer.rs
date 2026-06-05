use rdkafka::config::ClientConfig;
use rdkafka::error::KafkaError;

pub use rdkafka::producer::{FutureProducer, FutureRecord};

use crate::config::set_defaults;

/// Build a `FutureProducer` from the shared environment configuration.
pub async fn build_producer() -> Result<FutureProducer, KafkaError> {
    let mut config = ClientConfig::new();
    set_defaults(&mut config);
    config.set("message.timeout.ms", "5000");
    config.create()
}
