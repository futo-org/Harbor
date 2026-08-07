use rdkafka::client::ClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::ConsumerContext;
use rdkafka::consumer::stream_consumer::StreamConsumer;

pub use rdkafka::consumer::{CommitMode, Consumer};

use crate::config::{auto_offset_reset, prefixed, set_defaults};

pub struct CustomContext;

impl ClientContext for CustomContext {}

impl ConsumerContext for CustomContext {}

/// Build a subscribed `StreamConsumer` with auto-commit disabled. The group
/// id and topics are prefixed with the cluster id via [`prefixed`].
pub async fn build_consumer(group_id: &str, topics: &[&str]) -> StreamConsumer<CustomContext> {
    let mut config = ClientConfig::new();
    set_defaults(&mut config);
    config
        .set("group.id", prefixed(group_id))
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", auto_offset_reset());

    let consumer: StreamConsumer<CustomContext> = config
        .create_with_context(CustomContext)
        .expect("Consumer creation failed");

    let topics: Vec<String> = topics.iter().map(|topic| prefixed(topic)).collect();
    consumer
        .subscribe(&topics.iter().map(String::as_str).collect::<Vec<_>>())
        .expect("Can't subscribe to specified topics");

    consumer
}
