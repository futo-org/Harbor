use rdkafka::client::ClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::ConsumerContext;
use rdkafka::consumer::stream_consumer::StreamConsumer;

pub use rdkafka::consumer::{CommitMode, Consumer};

use crate::config::set_defaults;

pub struct CustomContext;

impl ClientContext for CustomContext {}

impl ConsumerContext for CustomContext {}

/// Build a subscribed `StreamConsumer` with auto-commit disabled.
pub async fn build_consumer(group_id: &str, topics: &[&str]) -> StreamConsumer<CustomContext> {
    let mut config = ClientConfig::new();
    set_defaults(&mut config);
    config
        .set("group.id", group_id)
        .set("enable.auto.commit", "false");

    let consumer: StreamConsumer<CustomContext> = config
        .create_with_context(CustomContext)
        .expect("Consumer creation failed");

    consumer
        .subscribe(topics)
        .expect("Can't subscribe to specified topics");

    consumer
}
