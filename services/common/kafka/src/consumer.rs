use rdkafka::client::ClientContext;
use rdkafka::config::{ClientConfig, RDKafkaLogLevel};
use rdkafka::consumer::ConsumerContext;
use rdkafka::consumer::stream_consumer::StreamConsumer;
use rdkafka::error::{KafkaError, KafkaResult};
use rdkafka::topic_partition_list::TopicPartitionList;

pub use rdkafka::consumer::Consumer;

use crate::config::{
    auto_commit_interval_ms, auto_offset_reset, max_poll_interval_ms, prefixed, set_defaults,
};

pub struct CustomContext;

// Forward librdkafka's events into tracing; the default context drops them.
impl ClientContext for CustomContext {
    fn log(&self, level: RDKafkaLogLevel, fac: &str, log_message: &str) {
        match level {
            RDKafkaLogLevel::Emerg
            | RDKafkaLogLevel::Alert
            | RDKafkaLogLevel::Critical
            | RDKafkaLogLevel::Error => {
                tracing::error!(target: "rdkafka", fac, "{log_message}")
            }
            RDKafkaLogLevel::Warning => {
                tracing::warn!(target: "rdkafka", fac, "{log_message}")
            }
            RDKafkaLogLevel::Notice | RDKafkaLogLevel::Info => {
                tracing::info!(target: "rdkafka", fac, "{log_message}")
            }
            RDKafkaLogLevel::Debug => {
                tracing::debug!(target: "rdkafka", fac, "{log_message}")
            }
        }
    }

    fn error(&self, error: KafkaError, reason: &str) {
        tracing::error!(target: "rdkafka", %error, "{reason}");
    }
}

impl ConsumerContext for CustomContext {
    fn commit_callback(&self, result: KafkaResult<()>, offsets: &TopicPartitionList) {
        if let Err(error) = result {
            tracing::warn!(target: "rdkafka", %error, ?offsets, "offset commit failed");
        }
    }
}

/// Build a subscribed `StreamConsumer`. The group id and topics are prefixed
/// with the cluster id via [`prefixed`].
///
/// Only offsets stored with [`Consumer::store_offset_from_message`] are
/// committed, on an interval and on partition revoke.
pub async fn build_consumer(group_id: &str, topics: &[&str]) -> StreamConsumer<CustomContext> {
    let mut config = ClientConfig::new();
    set_defaults(&mut config);
    config
        .set("group.id", prefixed(group_id))
        .set("enable.auto.commit", "true")
        .set("enable.auto.offset.store", "false")
        .set("auto.commit.interval.ms", auto_commit_interval_ms())
        .set("auto.offset.reset", auto_offset_reset())
        .set("max.poll.interval.ms", max_poll_interval_ms());

    let consumer: StreamConsumer<CustomContext> = config
        .create_with_context(CustomContext)
        .expect("Consumer creation failed");

    let topics: Vec<String> = topics.iter().map(|topic| prefixed(topic)).collect();
    consumer
        .subscribe(&topics.iter().map(String::as_str).collect::<Vec<_>>())
        .expect("Can't subscribe to specified topics");

    consumer
}
